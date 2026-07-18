import express, { Request, Response } from 'express';
import pool from '../config/database';
import { categorizeIngredient } from '../services/ingredientCategorizer';
import { findRecipesByIngredients } from '../services/spoonacularService';
import { findIngredientCombos } from '../services/ingredientRecommender';
import { createPantrySignature } from '../utils/pantrySignature';

const router = express.Router();

// Get grocery list for a specific week
router.get('/', async (req: Request, res: Response) => {
  try {
    const { week_start_date } = req.query;

    if (!week_start_date) {
      return res.status(400).json({ error: 'week_start_date is required' });
    }

    const result = await pool.query(`
      SELECT gl.*, i.name as ingredient_name, i.category, gp.price as store_price
      FROM grocery_list gl
      JOIN ingredients i ON gl.ingredient_id = i.id
      LEFT JOIN grocery_prices gp ON i.id = gp.ingredient_id AND gp.store_name = 'Smiths' AND gp.household_id = gl.household_id
      WHERE gl.week_start_date = $1 AND gl.household_id = $2
      ORDER BY i.category, i.name
    `, [week_start_date, req.householdId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching grocery list:', error);
    res.status(500).json({ error: 'Failed to fetch grocery list' });
  }
});

// Generate grocery list from scheduled meals
router.post('/generate', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const householdId = req.householdId;

    const { week_start_date, week_end_date } = req.body;

    if (!week_start_date || !week_end_date) {
      return res.status(400).json({ error: 'week_start_date and week_end_date are required' });
    }

    // Clear existing grocery list for this week
    await client.query('DELETE FROM grocery_list WHERE week_start_date = $1 AND household_id = $2', [week_start_date, householdId]);

    // Get all scheduled meals for the week
    const mealsResult = await client.query(`
      SELECT sm.*, r.servings as recipe_servings
      FROM scheduled_meals sm
      JOIN recipes r ON sm.recipe_id = r.id
      WHERE sm.meal_date >= $1 AND sm.meal_date <= $2 AND sm.household_id = $3
    `, [week_start_date, week_end_date, householdId]);

    const meals = mealsResult.rows;

    // Aggregate ingredients needed — keyed by ingredientId+unit so mismatched
    // units are kept as separate line items rather than summed incorrectly.
    const ingredientMap = new Map<string, { ingredientId: number; quantity: number; unit: string }>();

    for (const meal of meals) {
      const ingredientsResult = await client.query(`
        SELECT ri.*, i.name
        FROM recipe_ingredients ri
        JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE ri.recipe_id = $1
      `, [meal.recipe_id]);

      for (const ing of ingredientsResult.rows) {
        const scaleFactor = meal.servings / meal.recipe_servings;
        const scaledQuantity = (ing.quantity || 0) * scaleFactor;
        const unit = ing.unit || 'unit';
        const key = `${ing.ingredient_id}_${unit}`;

        if (ingredientMap.has(key)) {
          ingredientMap.get(key)!.quantity += scaledQuantity;
        } else {
          ingredientMap.set(key, {
            ingredientId: ing.ingredient_id,
            quantity: scaledQuantity,
            unit,
          });
        }
      }
    }

    // Check pantry for existing ingredients
    const pantryResult = await client.query('SELECT * FROM pantry WHERE household_id = $1', [householdId]);
    const pantryMap = new Map(
      pantryResult.rows.map(item => [item.ingredient_id, item])
    );

    // Insert into grocery list (subtract pantry quantities)
    for (const [, data] of ingredientMap.entries()) {
      const ingredientId = data.ingredientId;
      let neededQuantity = data.quantity;
      const pantryItem = pantryMap.get(data.ingredientId);

      if (pantryItem && !pantryItem.is_staple) {
        // Only subtract pantry quantity when units match
        if (pantryItem.unit === data.unit) {
          neededQuantity = Math.max(0, data.quantity - (pantryItem.quantity || 0));
        }
      }

      if (neededQuantity > 0 || (pantryItem && pantryItem.is_staple)) {
        // Get price from grocery_prices
        const priceResult = await client.query(`
          SELECT price FROM grocery_prices
          WHERE ingredient_id = $1 AND store_name = 'Smiths' AND household_id = $2
          ORDER BY last_updated DESC
          LIMIT 1
        `, [data.ingredientId, householdId]);

        const estimatedPrice = priceResult.rows[0]?.price || 0;

        await client.query(`
          INSERT INTO grocery_list (household_id, ingredient_id, quantity, unit, estimated_price, week_start_date)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [householdId, data.ingredientId, neededQuantity, data.unit, estimatedPrice, week_start_date]);
      }
    }

    await client.query('COMMIT');

    // Fetch and return the generated list
    const generatedList = await pool.query(`
      SELECT gl.*, i.name as ingredient_name, i.category, gp.price as store_price
      FROM grocery_list gl
      JOIN ingredients i ON gl.ingredient_id = i.id
      LEFT JOIN grocery_prices gp ON i.id = gp.ingredient_id AND gp.store_name = 'Smiths' AND gp.household_id = gl.household_id
      WHERE gl.week_start_date = $1 AND gl.household_id = $2
      ORDER BY i.category, i.name
    `, [week_start_date, householdId]);

    res.json(generatedList.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generating grocery list:', error);
    res.status(500).json({ error: 'Failed to generate grocery list' });
  } finally {
    client.release();
  }
});

// Add manual grocery item
router.post('/', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const householdId = req.householdId;

    const { ingredient_name, quantity, unit, week_start_date } = req.body;

    if (!ingredient_name || !week_start_date) {
      return res.status(400).json({ error: 'ingredient_name and week_start_date are required' });
    }

    // Find or create ingredient
    let ingredientResult = await client.query(
      'SELECT id FROM ingredients WHERE LOWER(name) = LOWER($1) AND household_id = $2',
      [ingredient_name, householdId]
    );

    let ingredientId;
    if (ingredientResult.rows.length === 0) {
      // Create new ingredient with AI-powered categorization
      const category = await categorizeIngredient(ingredient_name);
      const newIngredient = await client.query(
        'INSERT INTO ingredients (household_id, name, category) VALUES ($1, $2, $3) RETURNING id',
        [householdId, ingredient_name, category]
      );
      ingredientId = newIngredient.rows[0].id;
    } else {
      ingredientId = ingredientResult.rows[0].id;
    }

    // Get price from grocery_prices
    const priceResult = await client.query(`
      SELECT price FROM grocery_prices
      WHERE ingredient_id = $1 AND store_name = 'Smiths' AND household_id = $2
      ORDER BY last_updated DESC
      LIMIT 1
    `, [ingredientId, householdId]);

    const estimatedPrice = priceResult.rows[0]?.price || 0;

    // Insert into grocery list
    const groceryItemResult = await client.query(`
      INSERT INTO grocery_list (household_id, ingredient_id, quantity, unit, estimated_price, week_start_date, is_purchased)
      VALUES ($1, $2, $3, $4, $5, $6, false)
      RETURNING *
    `, [householdId, ingredientId, quantity || 1, unit || 'unit', estimatedPrice, week_start_date]);

    await client.query('COMMIT');

    // Fetch the complete item with ingredient details
    const result = await pool.query(`
      SELECT gl.*, i.name as ingredient_name, i.category, gp.price as store_price
      FROM grocery_list gl
      JOIN ingredients i ON gl.ingredient_id = i.id
      LEFT JOIN grocery_prices gp ON i.id = gp.ingredient_id AND gp.store_name = 'Smiths' AND gp.household_id = gl.household_id
      WHERE gl.id = $1
    `, [groceryItemResult.rows[0].id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding grocery item:', error);
    res.status(500).json({ error: 'Failed to add grocery item' });
  } finally {
    client.release();
  }
});

// Add recipe ingredients to grocery list
router.post('/from-recipe', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const householdId = req.householdId;

    const { recipe_id, week_start_date, servings } = req.body;

    if (!recipe_id || !week_start_date) {
      return res.status(400).json({ error: 'recipe_id and week_start_date are required' });
    }

    // Get recipe details
    const recipeResult = await client.query(
      'SELECT servings FROM recipes WHERE id = $1 AND household_id = $2',
      [recipe_id, householdId]
    );

    if (recipeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    const recipe = recipeResult.rows[0];
    const scaleFactor = servings ? servings / recipe.servings : 1;

    // Get recipe ingredients
    const ingredientsResult = await client.query(`
      SELECT ri.*, i.name
      FROM recipe_ingredients ri
      JOIN ingredients i ON ri.ingredient_id = i.id
      WHERE ri.recipe_id = $1
    `, [recipe_id]);

    const addedItems = [];

    for (const ing of ingredientsResult.rows) {
      const scaledQuantity = (ing.quantity || 0) * scaleFactor;

      // Get price from grocery_prices
      const priceResult = await client.query(`
        SELECT price FROM grocery_prices
        WHERE ingredient_id = $1 AND store_name = 'Smiths' AND household_id = $2
        ORDER BY last_updated DESC
        LIMIT 1
      `, [ing.ingredient_id, householdId]);

      const estimatedPrice = priceResult.rows[0]?.price || 0;

      // Check if item already exists in grocery list for this week
      const existingItem = await client.query(`
        SELECT id, quantity FROM grocery_list
        WHERE ingredient_id = $1 AND week_start_date = $2 AND household_id = $3
      `, [ing.ingredient_id, week_start_date, householdId]);

      if (existingItem.rows.length > 0) {
        // Update existing item quantity
        const newQuantity = (existingItem.rows[0].quantity || 0) + scaledQuantity;
        await client.query(`
          UPDATE grocery_list
          SET quantity = $1
          WHERE id = $2
        `, [newQuantity, existingItem.rows[0].id]);

        addedItems.push(existingItem.rows[0].id);
      } else {
        // Insert new item
        const groceryItemResult = await client.query(`
          INSERT INTO grocery_list (household_id, ingredient_id, quantity, unit, estimated_price, week_start_date, is_purchased)
          VALUES ($1, $2, $3, $4, $5, $6, false)
          RETURNING id
        `, [householdId, ing.ingredient_id, scaledQuantity, ing.unit, estimatedPrice, week_start_date]);

        addedItems.push(groceryItemResult.rows[0].id);
      }
    }

    await client.query('COMMIT');

    // Fetch all added/updated items
    if (addedItems.length > 0) {
      const result = await pool.query(`
        SELECT gl.*, i.name as ingredient_name, i.category, gp.price as store_price
        FROM grocery_list gl
        JOIN ingredients i ON gl.ingredient_id = i.id
        LEFT JOIN grocery_prices gp ON i.id = gp.ingredient_id AND gp.store_name = 'Smiths' AND gp.household_id = gl.household_id
        WHERE gl.id = ANY($1)
        ORDER BY i.category, i.name
      `, [addedItems]);

      res.status(201).json(result.rows);
    } else {
      res.status(201).json([]);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding recipe to grocery list:', error);
    res.status(500).json({ error: 'Failed to add recipe to grocery list' });
  } finally {
    client.release();
  }
});

// Mark item as purchased
router.patch('/:id/purchase', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const { is_purchased } = req.body;

    const result = await pool.query(`
      UPDATE grocery_list
      SET is_purchased = $1
      WHERE id = $2 AND household_id = $3
      RETURNING *
    `, [is_purchased, id, req.householdId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grocery item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating grocery item:', error);
    res.status(500).json({ error: 'Failed to update grocery item' });
  }
});

// Update grocery item
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const { quantity, unit, estimated_price, store_price } = req.body;

    const result = await pool.query(`
      UPDATE grocery_list
      SET quantity = $1, unit = $2, estimated_price = $3, store_price = COALESCE($4, store_price)
      WHERE id = $5 AND household_id = $6
      RETURNING *
    `, [quantity, unit, estimated_price, store_price ?? null, id, req.householdId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grocery item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating grocery item:', error);
    res.status(500).json({ error: 'Failed to update grocery item' });
  }
});

// Clear entire grocery list for a week (must be before /:id route)
router.delete('/clear', async (req: Request, res: Response) => {
  try {
    const { week_start_date } = req.query;

    if (!week_start_date) {
      return res.status(400).json({ error: 'week_start_date is required' });
    }

    await pool.query('DELETE FROM grocery_list WHERE week_start_date = $1 AND household_id = $2', [week_start_date, req.householdId]);
    res.json({ message: 'Grocery list cleared successfully' });
  } catch (error) {
    console.error('Error clearing grocery list:', error);
    res.status(500).json({ error: 'Failed to clear grocery list' });
  }
});

// Delete grocery item
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    await pool.query('DELETE FROM grocery_list WHERE id = $1 AND household_id = $2', [id, req.householdId]);
    res.json({ message: 'Grocery item deleted successfully' });
  } catch (error) {
    console.error('Error deleting grocery item:', error);
    res.status(500).json({ error: 'Failed to delete grocery item' });
  }
});

// Add purchased items to pantry
router.post('/add-to-pantry', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const householdId = req.householdId;

    const { week_start_date } = req.body;

    if (!week_start_date) {
      return res.status(400).json({ error: 'week_start_date is required' });
    }

    // Get all purchased items from grocery list
    const purchasedItems = await client.query(`
      SELECT gl.*, i.name as ingredient_name
      FROM grocery_list gl
      JOIN ingredients i ON gl.ingredient_id = i.id
      WHERE gl.week_start_date = $1 AND gl.is_purchased = true AND gl.household_id = $2
    `, [week_start_date, householdId]);

    let addedCount = 0;

    for (const item of purchasedItems.rows) {
      // Check if item already exists in pantry
      const existingPantry = await client.query(
        'SELECT id, quantity FROM pantry WHERE ingredient_id = $1 AND household_id = $2',
        [item.ingredient_id, householdId]
      );

      if (existingPantry.rows.length > 0) {
        // Update existing pantry item quantity
        const newQuantity = (existingPantry.rows[0].quantity || 0) + (item.quantity || 0);
        await client.query(
          'UPDATE pantry SET quantity = $1 WHERE id = $2',
          [newQuantity, existingPantry.rows[0].id]
        );
      } else {
        // Add new item to pantry
        await client.query(
          'INSERT INTO pantry (household_id, ingredient_id, quantity, unit, is_staple) VALUES ($1, $2, $3, $4, false)',
          [householdId, item.ingredient_id, item.quantity, item.unit]
        );
      }

      addedCount++;
    }

    await client.query('COMMIT');

    // After successfully adding items to pantry, refresh recommendations cache
    if (addedCount > 0) {
      console.log('🔄 Refreshing recommendations cache after pantry update...');

      try {
        // Get updated pantry items
        const pantryResult = await pool.query(`
          SELECT i.name
          FROM pantry p
          JOIN ingredients i ON p.ingredient_id = i.id
          WHERE p.household_id = $1 AND (p.quantity > 0 OR p.is_staple = true)
          ORDER BY i.name ASC
        `, [householdId]);

        const ingredientNames = pantryResult.rows.map(row => row.name);
        const pantrySignature = createPantrySignature(ingredientNames);

        // Fetch and cache new recipe recommendations
        const recommendations = await findRecipesByIngredients(ingredientNames, 2);
        const recipeExpiresAt = new Date();
        recipeExpiresAt.setFullYear(recipeExpiresAt.getFullYear() + 10);

        await pool.query(`
          INSERT INTO cached_recipe_recommendations (household_id, pantry_signature, recommendations, expires_at)
          VALUES ($1, $2, $3, $4)
        `, [householdId, pantrySignature, JSON.stringify(recommendations), recipeExpiresAt]);

        console.log(`✅ Cached ${recommendations.length} new recipe recommendations`);

        // Fetch and cache new ingredient combos
        const combos = await findIngredientCombos(ingredientNames, 5);
        const combosExpiresAt = new Date();
        combosExpiresAt.setFullYear(combosExpiresAt.getFullYear() + 10);

        await pool.query(`
          INSERT INTO cached_ingredient_combos (household_id, pantry_signature, combos, expires_at)
          VALUES ($1, $2, $3, $4)
        `, [householdId, pantrySignature, JSON.stringify(combos), combosExpiresAt]);

        console.log(`✅ Cached ${combos.length} new ingredient combos`);
      } catch (cacheError) {
        // Log error but don't fail the request
        console.error('⚠️  Error refreshing recommendations cache:', cacheError);
      }
    }

    res.json({
      message: `Added ${addedCount} purchased items to pantry`,
      count: addedCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding purchased items to pantry:', error);
    res.status(500).json({ error: 'Failed to add items to pantry' });
  } finally {
    client.release();
  }
});

// Get/update grocery prices
router.get('/prices', async (req: Request, res: Response) => {
  try {
    const { store_name } = req.query;

    let query = 'SELECT gp.*, i.name as ingredient_name FROM grocery_prices gp JOIN ingredients i ON gp.ingredient_id = i.id WHERE gp.household_id = $1';
    const params: any[] = [req.householdId];

    if (store_name) {
      params.push(store_name);
      query += ` AND gp.store_name = $${params.length}`;
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching grocery prices:', error);
    res.status(500).json({ error: 'Failed to fetch grocery prices' });
  }
});

router.post('/prices', async (req: Request, res: Response) => {
  try {
    const { ingredient_id, store_name, price, quantity, unit } = req.body;

    const result = await pool.query(`
      INSERT INTO grocery_prices (household_id, ingredient_id, store_name, price, quantity, unit, last_updated)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (household_id, ingredient_id, store_name)
      DO UPDATE SET
        price = EXCLUDED.price,
        quantity = EXCLUDED.quantity,
        unit = EXCLUDED.unit,
        last_updated = CURRENT_TIMESTAMP
      RETURNING *
    `, [req.householdId, ingredient_id, store_name, price, quantity, unit]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding grocery price:', error);
    res.status(500).json({ error: 'Failed to add grocery price' });
  }
});

export default router;
