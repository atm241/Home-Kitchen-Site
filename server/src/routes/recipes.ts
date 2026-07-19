import express, { Request, Response } from 'express';
import pool from '../config/database';
import { scrapeRecipe } from '../services/recipeScraper';
import { categorizeIngredient } from '../services/ingredientCategorizer';
import { getRecipeDetails } from '../services/spoonacularService';
import { cleanText } from '../utils/cleanText';

const router = express.Router();

const RECIPE_SELECT = `
  SELECT r.*,
    json_agg(
      json_build_object(
        'ingredient_id', ri.ingredient_id,
        'name', i.name,
        'quantity', ri.quantity,
        'unit', ri.unit,
        'notes', ri.notes
      )
    ) FILTER (WHERE i.id IS NOT NULL) as ingredients
  FROM recipes r
  LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
  LEFT JOIN ingredients i ON ri.ingredient_id = i.id
`;

// Scrape a recipe URL and insert it (plus its ingredients) in one transaction.
// Shared by the single-URL and bulk import routes. Returns the new recipe id.
async function scrapeAndInsertRecipe(householdId: number, url: string): Promise<number> {
  const scrapedData = await scrapeRecipe(url);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const recipeResult = await client.query(`
      INSERT INTO recipes (household_id, name, description, source_url, category, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber, image_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id
    `, [
      householdId, scrapedData.name, scrapedData.description, url, scrapedData.category ?? null,
      scrapedData.servings || 4, scrapedData.prep_time, scrapedData.cook_time,
      scrapedData.instructions, scrapedData.calories, scrapedData.protein,
      scrapedData.carbs, scrapedData.fat, scrapedData.fiber,
      scrapedData.image_url ?? null,
    ]);

    const recipeId = recipeResult.rows[0].id;

    if (scrapedData.ingredients && scrapedData.ingredients.length > 0) {
      for (const ing of scrapedData.ingredients) {
        const cat = await categorizeIngredient(ing.name);
        const ingResult = await client.query(`
          INSERT INTO ingredients (household_id, name, category) VALUES ($1,$2,$3)
          ON CONFLICT (household_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id
        `, [householdId, ing.name, cat]);
        const ingredientId = ingResult.rows[0].id;
        await client.query(`
          INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (recipe_id, ingredient_id) DO UPDATE
            SET quantity = COALESCE(recipe_ingredients.quantity,0) + COALESCE(EXCLUDED.quantity,0)
        `, [recipeId, ingredientId, ing.quantity, ing.unit, ing.notes]);
      }
    }

    await client.query('COMMIT');
    return recipeId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Get all recipes
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      RECIPE_SELECT + ' WHERE r.household_id = $1 GROUP BY r.id ORDER BY r.created_at DESC',
      [req.householdId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
});

// Filter recipes by nutritional goals (must be before /:id)
router.get('/filter/nutritional', async (req: Request, res: Response) => {
  try {
    const { maxCarbs, minProtein, dietaryTag } = req.query;

    let query = RECIPE_SELECT + ' WHERE r.household_id = $1';
    const params: any[] = [req.householdId];
    let p = 2;

    if (maxCarbs) {
      query += ` AND r.carbs <= $${p++}`;
      params.push(parseFloat(maxCarbs as string));
    }
    if (minProtein) {
      query += ` AND r.protein >= $${p++}`;
      params.push(parseFloat(minProtein as string));
    }
    if (dietaryTag) {
      query += ` AND $${p++} = ANY(r.dietary_tags)`;
      params.push(dietaryTag as string);
    }

    query += ' GROUP BY r.id ORDER BY r.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error filtering recipes:', error);
    res.status(500).json({ error: 'Failed to filter recipes' });
  }
});

// Get single recipe
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const result = await pool.query(
      RECIPE_SELECT + ' WHERE r.id = $1 AND r.household_id = $2 GROUP BY r.id',
      [id, req.householdId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).json({ error: 'Failed to fetch recipe' });
  }
});

// Create new recipe
router.post('/', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const householdId = req.householdId;

    const {
      name, description, source_url, category, servings, prep_time, cook_time,
      instructions, calories, protein, carbs, fat, fiber,
      image_url, dietary_tags, difficulty, personal_notes, ingredients,
    } = req.body;

    const recipeResult = await client.query(`
      INSERT INTO recipes (household_id, name, description, source_url, category, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber, image_url, dietary_tags, difficulty, personal_notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [householdId, name, description, source_url, category, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber,
        image_url ?? null, dietary_tags ?? [], difficulty ?? null, personal_notes ?? null]);

    const recipe = recipeResult.rows[0];

    if (ingredients && ingredients.length > 0) {
      for (const ing of ingredients) {
        let ingredientId = ing.ingredient_id;
        if (!ingredientId && ing.name) {
          const cat = ing.category || await categorizeIngredient(ing.name);
          const ingResult = await client.query(`
            INSERT INTO ingredients (household_id, name, category) VALUES ($1, $2, $3)
            ON CONFLICT (household_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id
          `, [householdId, ing.name, cat]);
          ingredientId = ingResult.rows[0].id;
        }
        await client.query(`
          INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (recipe_id, ingredient_id) DO UPDATE
            SET quantity = COALESCE(recipe_ingredients.quantity,0) + COALESCE(EXCLUDED.quantity,0)
        `, [recipe.id, ingredientId, ing.quantity, ing.unit, ing.notes]);
      }
    }

    await client.query('COMMIT');

    const complete = await pool.query(
      RECIPE_SELECT + ' WHERE r.id = $1 GROUP BY r.id', [recipe.id]
    );
    res.status(201).json(complete.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating recipe:', error);
    res.status(500).json({ error: 'Failed to create recipe' });
  } finally {
    client.release();
  }
});

// Import recipe from URL
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const recipeId = await scrapeAndInsertRecipe(req.householdId!, url);

    const complete = await pool.query(
      RECIPE_SELECT + ' WHERE r.id = $1 GROUP BY r.id', [recipeId]
    );
    res.status(201).json(complete.rows[0]);
  } catch (error) {
    console.error('Error importing recipe:', error);
    res.status(500).json({ error: 'Failed to import recipe from URL' });
  }
});

// Bulk import recipes from a list of URLs. Each URL is scraped and inserted
// independently, so one bad link never fails the whole batch. URLs already
// imported for this household are skipped. Returns a per-URL report.
router.post('/import-bulk', async (req: Request, res: Response) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls must be a non-empty array' });
  }

  const householdId = req.householdId!;
  const results: Array<{ url: string; status: 'imported' | 'skipped' | 'failed'; recipeId?: number; error?: string }> = [];
  let imported = 0, skipped = 0, failed = 0;

  // De-duplicate the incoming list while preserving order.
  const seen = new Set<string>();

  for (const rawUrl of urls) {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);

    try {
      const existing = await pool.query(
        'SELECT id FROM recipes WHERE household_id = $1 AND source_url = $2 LIMIT 1',
        [householdId, url]
      );
      if (existing.rows.length > 0) {
        skipped++;
        results.push({ url, status: 'skipped', recipeId: existing.rows[0].id });
        continue;
      }

      const recipeId = await scrapeAndInsertRecipe(householdId, url);
      imported++;
      results.push({ url, status: 'imported', recipeId });
    } catch (error: any) {
      failed++;
      console.error(`Bulk import failed for ${url}:`, error.message);
      results.push({ url, status: 'failed', error: error.message });
    }
  }

  console.log(`📥 Bulk import: ${imported} imported, ${skipped} skipped, ${failed} failed`);
  res.status(201).json({ imported, skipped, failed, results });
});

// Update recipe
router.put('/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });

    const existingResult = await client.query(
      'SELECT * FROM recipes WHERE id = $1 AND household_id = $2', [id, req.householdId]
    );
    if (existingResult.rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });

    const e = existingResult.rows[0];
    const {
      name = e.name, description = e.description, source_url = e.source_url,
      category = e.category, servings = e.servings, prep_time = e.prep_time,
      cook_time = e.cook_time, instructions = e.instructions, calories = e.calories,
      protein = e.protein, carbs = e.carbs, fat = e.fat, fiber = e.fiber,
      image_url = e.image_url, dietary_tags = e.dietary_tags, difficulty = e.difficulty,
      personal_notes = e.personal_notes, ingredients,
    } = req.body;

    await client.query(`
      UPDATE recipes
      SET name=$1, description=$2, source_url=$3, category=$4, servings=$5,
          prep_time=$6, cook_time=$7, instructions=$8, calories=$9,
          protein=$10, carbs=$11, fat=$12, fiber=$13, image_url=$14,
          dietary_tags=$15, difficulty=$16, personal_notes=$17, updated_at=CURRENT_TIMESTAMP
      WHERE id=$18 AND household_id=$19
    `, [name, description, source_url, category, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber, image_url,
        dietary_tags, difficulty, personal_notes, id, req.householdId]);

    if (ingredients !== undefined) {
      await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [id]);
      if (ingredients.length > 0) {
        for (const ing of ingredients) {
          let ingredientId = ing.ingredient_id;
          if (!ingredientId && ing.name) {
            const cat = ing.category || await categorizeIngredient(ing.name);
            const ingResult = await client.query(`
              INSERT INTO ingredients (household_id, name, category) VALUES ($1,$2,$3)
              ON CONFLICT (household_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id
            `, [req.householdId, ing.name, cat]);
            ingredientId = ingResult.rows[0].id;
          }
          await client.query(`
            INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (recipe_id, ingredient_id) DO UPDATE
              SET quantity = COALESCE(recipe_ingredients.quantity,0) + COALESCE(EXCLUDED.quantity,0)
          `, [id, ingredientId, ing.quantity, ing.unit, ing.notes]);
        }
      }
    }

    await client.query('COMMIT');

    const result = await pool.query(
      RECIPE_SELECT + ' WHERE r.id = $1 GROUP BY r.id', [id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating recipe:', error);
    res.status(500).json({ error: 'Failed to update recipe' });
  } finally {
    client.release();
  }
});

// Toggle favorite
router.patch('/:id/favorite', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const result = await pool.query(
      'UPDATE recipes SET is_favorite = NOT is_favorite WHERE id = $1 AND household_id = $2 RETURNING is_favorite',
      [id, req.householdId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });
    res.json({ is_favorite: result.rows[0].is_favorite });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// Delete recipe
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    await pool.query('DELETE FROM recipes WHERE id = $1 AND household_id = $2', [id, req.householdId]);
    res.json({ message: 'Recipe deleted successfully' });
  } catch (error) {
    console.error('Error deleting recipe:', error);
    res.status(500).json({ error: 'Failed to delete recipe' });
  }
});

// Import recipe from Spoonacular by ID
router.post('/import-spoonacular/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const spoonacularId = parseInt(req.params.id);
    const householdId = req.householdId;
    console.log(`📥 Importing recipe from Spoonacular ID: ${spoonacularId}`);

    const spoonacularRecipe = await getRecipeDetails(spoonacularId);

    await client.query('BEGIN');

    const recipeResult = await client.query(`
      INSERT INTO recipes (household_id, name, description, source_url, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber, image_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      householdId,
      spoonacularRecipe.title,
      cleanText(spoonacularRecipe.summary).substring(0, 500),
      spoonacularRecipe.sourceUrl,
      spoonacularRecipe.servings,
      spoonacularRecipe.readyInMinutes,
      spoonacularRecipe.readyInMinutes,
      spoonacularRecipe.instructions || '',
      spoonacularRecipe.nutrition?.nutrients.find((n: any) => n.name === 'Calories')?.amount || null,
      spoonacularRecipe.nutrition?.nutrients.find((n: any) => n.name === 'Protein')?.amount || null,
      spoonacularRecipe.nutrition?.nutrients.find((n: any) => n.name === 'Carbohydrates')?.amount || null,
      spoonacularRecipe.nutrition?.nutrients.find((n: any) => n.name === 'Fat')?.amount || null,
      spoonacularRecipe.nutrition?.nutrients.find((n: any) => n.name === 'Fiber')?.amount || null,
      spoonacularRecipe.image || null,
    ]);

    const recipe = recipeResult.rows[0];
    console.log(`✅ Recipe created with ID: ${recipe.id}`);

    for (const ingredient of spoonacularRecipe.extendedIngredients) {
      let ingredientResult = await client.query(
        'SELECT id FROM ingredients WHERE LOWER(name) = LOWER($1) AND household_id = $2',
        [ingredient.name, householdId]
      );
      let ingredientId: number;
      if (ingredientResult.rows.length > 0) {
        ingredientId = ingredientResult.rows[0].id;
      } else {
        const cat = await categorizeIngredient(ingredient.name);
        const newIngredient = await client.query(
          'INSERT INTO ingredients (household_id, name, category) VALUES ($1,$2,$3) RETURNING id',
          [householdId, ingredient.name, cat]
        );
        ingredientId = newIngredient.rows[0].id;
      }
      await client.query(`
        INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
        VALUES ($1,$2,$3,$4,$5)
      `, [recipe.id, ingredientId, ingredient.amount || null, ingredient.unit || null, null]);
    }

    await client.query('COMMIT');
    console.log(`✅ Successfully imported recipe: ${recipe.name}`);
    res.status(201).json(recipe);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error importing recipe from Spoonacular:', error);
    res.status(500).json({ error: 'Failed to import recipe from Spoonacular' });
  } finally {
    client.release();
  }
});

export default router;
