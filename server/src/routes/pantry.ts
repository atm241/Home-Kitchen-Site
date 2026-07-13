import express, { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../config/database';
import { categorizeIngredient } from '../services/ingredientCategorizer';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const router = express.Router();

// Get all pantry items
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.*, i.name as ingredient_name, i.category
      FROM pantry p
      JOIN ingredients i ON p.ingredient_id = i.id
      ORDER BY i.name ASC
    `);
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
      WHERE p.is_staple = true
      ORDER BY i.name ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pantry staples:', error);
    res.status(500).json({ error: 'Failed to fetch pantry staples' });
  }
});

// Add item to pantry
router.post('/', async (req: Request, res: Response) => {
  try {
    const { ingredient_id, quantity, unit, expiration_date, is_staple } = req.body;

    const result = await pool.query(`
      INSERT INTO pantry (ingredient_id, quantity, unit, expiration_date, is_staple, last_updated)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (ingredient_id)
      DO UPDATE SET
        quantity = EXCLUDED.quantity,
        unit = EXCLUDED.unit,
        expiration_date = EXCLUDED.expiration_date,
        is_staple = EXCLUDED.is_staple,
        last_updated = CURRENT_TIMESTAMP
      RETURNING *
    `, [ingredient_id, quantity, unit, expiration_date, is_staple || false]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding pantry item:', error);
    res.status(500).json({ error: 'Failed to add pantry item' });
  }
});

// Get expiring pantry items and recipes that can use them
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
      WHERE p.expiration_date IS NOT NULL
        AND p.expiration_date::date <= CURRENT_DATE + ($1 * INTERVAL '1 day')
      ORDER BY p.expiration_date ASC
    `, [days]);

    const recipesResult = await pool.query(`
      SELECT
        r.id, r.name, r.image_url, r.category, r.servings, r.calories,
        r.prep_time, r.cook_time, r.difficulty, r.dietary_tags, r.is_favorite,
        COUNT(DISTINCT p.ingredient_id)::int as expiring_ingredient_count,
        json_agg(DISTINCT jsonb_build_object(
          'name', i.name,
          'expiration_date', p.expiration_date,
          'days_until_expiry', (p.expiration_date::date - CURRENT_DATE)::int
        )) as expiring_ingredients
      FROM recipes r
      JOIN recipe_ingredients ri ON r.id = ri.recipe_id
      JOIN ingredients i ON ri.ingredient_id = i.id
      JOIN pantry p ON p.ingredient_id = ri.ingredient_id
      WHERE p.expiration_date IS NOT NULL
        AND p.expiration_date::date <= CURRENT_DATE + ($1 * INTERVAL '1 day')
      GROUP BY r.id
      ORDER BY expiring_ingredient_count DESC, r.name ASC
      LIMIT 10
    `, [days]);

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
      max_tokens: 1024,
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
              text: `Analyze this grocery receipt and extract all purchased grocery items.
Return ONLY a JSON array with no other text:
[{"name": "milk", "quantity": 1, "unit": "gallon"}, {"name": "eggs", "quantity": 12, "unit": "count"}]

Rules:
- name: lowercase, human-readable (e.g. "chicken breast" not "BNLS SKNLS CHKN")
- quantity: a number, default 1 if unclear
- unit: best guess (lb, oz, count, bag, box, gallon, unit, etc.)
- Skip non-food items, tax lines, totals, and subtotals
- If this is not a receipt, return []`,
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
    try {
      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      rawItems = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    const SHELF_LIFE_DAYS: Record<string, number> = {
      'Produce': 5, 'Proteins': 3, 'Dairy': 7, 'Beverages': 7,
      'Snacks': 30, 'Condiments & Sauces': 90, 'Grains & Pasta': 180,
      'Oils & Vinegars': 365, 'Baking': 365, 'Canned Goods': 730, 'Spices & Seasonings': 730,
    };

    const results = [];
    for (const item of rawItems) {
      if (!item.name) continue;
      const category = await categorizeIngredient(item.name);

      let ingResult = await pool.query(
        'SELECT id FROM ingredients WHERE LOWER(name) = LOWER($1)',
        [item.name]
      );
      let ingredientId: number;
      if (ingResult.rows.length > 0) {
        ingredientId = ingResult.rows[0].id;
      } else {
        const newIng = await pool.query(
          'INSERT INTO ingredients (name, category) VALUES ($1, $2) RETURNING id',
          [item.name, category]
        );
        ingredientId = newIng.rows[0].id;
      }

      const days = SHELF_LIFE_DAYS[category];
      let expiration_date: string | null = null;
      if (days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        expiration_date = d.toISOString().split('T')[0];
      }

      results.push({
        ingredient_id: ingredientId,
        name: item.name,
        quantity: item.quantity || 1,
        unit: item.unit || 'unit',
        category,
        expiration_date,
      });
    }

    res.json(results);
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
      WHERE id = $5
      RETURNING *
    `, [quantity, unit, expiration_date, is_staple, id]);

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
    await pool.query('DELETE FROM pantry WHERE id = $1', [id]);
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
      UPDATE meal_portions
      SET servings_consumed = servings_consumed + $1
      WHERE id = $2
      RETURNING *
    `, [servings_consumed, meal_portion_id]);

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
