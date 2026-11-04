import express, { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../config/database';
import { categorizeIngredient } from '../services/ingredientCategorizer';
import { lookupBarcode } from '../services/barcodeService';
import { getExpirationDate } from '../services/shelfLife';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const router = express.Router();

// Get all pantry items
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.*, i.name as ingredient_name, i.category
      FROM pantry p
      JOIN ingredients i ON p.ingredient_id = i.id
      WHERE p.household_id = $1
      ORDER BY i.name ASC
    `, [req.householdId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pantry items:', error);
    res.status(500).json({ error: 'Failed to fetch pantry items' });
  }
});

// Get pantry staples
router.get('/staples', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.*, i.name as ingredient_name, i.category
      FROM pantry p
      JOIN ingredients i ON p.ingredient_id = i.id
      WHERE p.is_staple = true AND p.household_id = $1
      ORDER BY i.name ASC
    `, [req.householdId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pantry staples:', error);
    res.status(500).json({ error: 'Failed to fetch pantry staples' });
  }
});

// Look up a scanned barcode via Open Food Facts (must be before /:id-style routes)
router.get('/barcode/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const product = await lookupBarcode(code);
    if (!product) return res.status(404).json({ error: 'Product not found for this barcode' });
    res.json(product);
  } catch (error) {
    console.error('Error looking up barcode:', error);
    res.status(500).json({ error: 'Failed to look up barcode' });
  }
});

// Add item to pantry
router.post('/', async (req: Request, res: Response) => {
  try {
    const { ingredient_id, quantity, unit, expiration_date, is_staple } = req.body;

    const result = await pool.query(`
      INSERT INTO pantry (household_id, ingredient_id, quantity, unit, expiration_date, is_staple, last_updated)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (household_id, ingredient_id)
      DO UPDATE SET
        quantity = EXCLUDED.quantity,
        unit = EXCLUDED.unit,
        expiration_date = EXCLUDED.expiration_date,
        is_staple = EXCLUDED.is_staple,
        last_updated = CURRENT_TIMESTAMP
      RETURNING *
    `, [req.householdId, ingredient_id, quantity, unit, expiration_date, is_staple || false]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding pantry item:', error);
    res.status(500).json({ error: 'Failed to add pantry item' });
  }
});

// Get expiring pantry items and recipes that can use them
// Suggested expiration date for a food, from the shelf-life reference table
router.get('/suggested-expiry', async (req: Request, res: Response) => {
  try {
    const name = (req.query.name as string) || '';
    const category = (req.query.category as string) || null;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const expiration_date = await getExpirationDate(name, category);
    res.json({ expiration_date });
  } catch (error) {
    console.error('Error computing suggested expiry:', error);
    res.status(500).json({ error: 'Failed to compute suggested expiration' });
  }
});

router.get('/use-it-up', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 5;

    const expiringResult = await pool.query(`
      SELECT
        p.id, p.quantity, p.unit, p.expiration_date,
        i.name as ingredient_name, i.category,
        (p.expiration_date::date - CURRENT_DATE)::int as days_until_expiry
      FROM pantry p
      JOIN ingredients i ON p.ingredient_id = i.id
      WHERE p.household_id = $2
        AND p.expiration_date IS NOT NULL
        AND p.expiration_date::date <= CURRENT_DATE + ($1 * INTERVAL '1 day')
      ORDER BY p.expiration_date ASC
    `, [days, req.householdId]);

    // Recipe imports create their own ingredient rows, so pantry items and
    // recipe ingredients rarely share an id — match by name containment
    // instead ("Black Beans" ⊂ "(15-ounce) can black beans, rinsed").
    const recipesResult = await pool.query(`
      SELECT
        r.id, r.name, r.image_url, r.category, r.servings, r.calories,
        r.prep_time, r.cook_time, r.difficulty, r.dietary_tags, r.is_favorite,
        COUNT(DISTINCT p.id)::int as expiring_ingredient_count,
        json_agg(DISTINCT jsonb_build_object(
          'name', pi.name,
          'expiration_date', p.expiration_date,
          'days_until_expiry', (p.expiration_date::date - CURRENT_DATE)::int
        )) as expiring_ingredients
      FROM recipes r
      JOIN recipe_ingredients ri ON r.id = ri.recipe_id
      JOIN ingredients i ON ri.ingredient_id = i.id
      JOIN pantry p ON p.household_id = r.household_id
      JOIN ingredients pi ON p.ingredient_id = pi.id
      WHERE r.household_id = $2
        AND p.expiration_date IS NOT NULL
        AND p.expiration_date::date <= CURRENT_DATE + ($1 * INTERVAL '1 day')
        AND (LOWER(i.name) LIKE '%' || LOWER(pi.name) || '%'
          OR LOWER(pi.name) LIKE '%' || LOWER(i.name) || '%')
      GROUP BY r.id
      ORDER BY expiring_ingredient_count DESC, r.name ASC
      LIMIT 10
    `, [days, req.householdId]);

    res.json({
      expiringItems: expiringResult.rows,
      recipes: recipesResult.rows,
    });
  } catch (error) {
    console.error('Error fetching use-it-up data:', error);
    res.status(500).json({ error: 'Failed to fetch expiring item suggestions' });
  }
});

// Parse a receipt image and extract grocery items using AI vision
router.post('/parse-receipt', async (req: Request, res: Response) => {
  try {
    const { image, mediaType } = req.body;
    if (!image) return res.status(400).json({ error: 'Image data is required' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const safeMediaType = (allowedTypes.includes(mediaType) ? mediaType : 'image/jpeg') as
      'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: safeMediaType, data: image },
            },
            {
              type: 'text',
              text: `Analyze this grocery receipt. Extract the purchased grocery items and the receipt's final total.
Return ONLY JSON with no other text:
{"store": "Smith's", "date": "2026-11-03", "total": 84.12, "items": [{"name": "milk", "quantity": 1, "unit": "gallon"}, {"name": "eggs", "quantity": 12, "unit": "count"}]}

Rules:
- total: the final amount paid (after tax and discounts) as a number, or null if you can't read it
- store: the store name, or null; date: the purchase date as YYYY-MM-DD, or null
- name: lowercase, human-readable (e.g. "chicken breast" not "BNLS SKNLS CHKN")
- quantity: a number, default 1 if unclear
- unit: best guess (lb, oz, count, bag, box, gallon, unit, etc.)
- Skip non-food items, tax lines, totals, and subtotals in items
- If this is not a receipt, return {"store": null, "date": null, "total": null, "items": []}`,
            },
          ],
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected AI response' });
    }

    let rawItems: { name: string; quantity: number; unit: string }[] = [];
    let total: number | null = null;
    let store: string | null = null;
    let purchasedOn: string | null = null;
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      if (Array.isArray(parsed)) {
        rawItems = parsed;
      } else if (parsed && typeof parsed === 'object') {
        rawItems = Array.isArray(parsed.items) ? parsed.items : [];
        total = typeof parsed.total === 'number' && parsed.total >= 0 ? Math.round(parsed.total * 100) / 100 : null;
        store = typeof parsed.store === 'string' && parsed.store.trim() ? parsed.store.trim().slice(0, 100) : null;
        purchasedOn = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
      }
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    const results = [];
    for (const item of rawItems) {
      if (!item.name) continue;
      const category = await categorizeIngredient(item.name);

      let ingResult = await pool.query(
        'SELECT id FROM ingredients WHERE LOWER(name) = LOWER($1) AND household_id = $2',
        [item.name, req.householdId]
      );
      let ingredientId: number;
      if (ingResult.rows.length > 0) {
        ingredientId = ingResult.rows[0].id;
      } else {
        const newIng = await pool.query(
          'INSERT INTO ingredients (household_id, name, category) VALUES ($1, $2, $3) RETURNING id',
          [req.householdId, item.name, category]
        );
        ingredientId = newIng.rows[0].id;
      }

      const expiration_date = await getExpirationDate(item.name, category);

      results.push({
        ingredient_id: ingredientId,
        name: item.name,
        quantity: item.quantity || 1,
        unit: item.unit || 'unit',
        category,
        expiration_date,
      });
    }

    res.json({ items: results, total, store, purchased_on: purchasedOn });
  } catch (error) {
    console.error('Error parsing receipt:', error);
    res.status(500).json({ error: 'Failed to parse receipt' });
  }
});

// Update pantry item
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const { quantity, unit, expiration_date, is_staple } = req.body;

    const result = await pool.query(`
      UPDATE pantry
      SET quantity = $1, unit = $2, expiration_date = $3, is_staple = $4, last_updated = CURRENT_TIMESTAMP
      WHERE id = $5 AND household_id = $6
      RETURNING *
    `, [quantity, unit, expiration_date, is_staple, id, req.householdId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pantry item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating pantry item:', error);
    res.status(500).json({ error: 'Failed to update pantry item' });
  }
});

// Remove item from pantry
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    await pool.query('DELETE FROM pantry WHERE id = $1 AND household_id = $2', [id, req.householdId]);
    res.json({ message: 'Pantry item removed successfully' });
  } catch (error) {
    console.error('Error removing pantry item:', error);
    res.status(500).json({ error: 'Failed to remove pantry item' });
  }
});

// Add servings to pantry (after making a meal)
router.post('/add-servings', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { scheduled_meal_id, servings_made, date_made } = req.body;

    // Verify the scheduled meal belongs to this household before recording against it
    const mealCheck = await client.query(
      'SELECT id FROM scheduled_meals WHERE id = $1 AND household_id = $2',
      [scheduled_meal_id, req.householdId]
    );
    if (mealCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Scheduled meal not found' });
    }

    // Create meal portion record
    await client.query(`
      INSERT INTO meal_portions (scheduled_meal_id, servings_made, servings_consumed, date_made)
      VALUES ($1, $2, 0, $3)
    `, [scheduled_meal_id, servings_made, date_made]);

    // Note: In a more advanced version, we could add the made meal as "leftovers" in pantry
    // For now, we just track it in meal_portions

    await client.query('COMMIT');
    res.json({ message: 'Meal servings recorded successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding meal servings:', error);
    res.status(500).json({ error: 'Failed to add meal servings' });
  } finally {
    client.release();
  }
});

// Consume servings from pantry (meal portions)
router.post('/consume-servings', async (req: Request, res: Response) => {
  try {
    const { meal_portion_id, servings_consumed } = req.body;

    const result = await pool.query(`
      UPDATE meal_portions mp
      SET servings_consumed = servings_consumed + $1
      FROM scheduled_meals sm
      WHERE mp.scheduled_meal_id = sm.id
        AND mp.id = $2 AND sm.household_id = $3
      RETURNING mp.*
    `, [servings_consumed, meal_portion_id, req.householdId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal portion not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error consuming servings:', error);
    res.status(500).json({ error: 'Failed to consume servings' });
  }
});

export default router;
