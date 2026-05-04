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

// Get all recipes
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      RECIPE_SELECT + ' GROUP BY r.id ORDER BY r.created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
});

// Get single recipe
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const result = await pool.query(
      RECIPE_SELECT + ' WHERE r.id = $1 GROUP BY r.id',
      [id]
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

    const {
      name, description, source_url, category, servings, prep_time, cook_time,
      instructions, calories, protein, carbs, fat, fiber,
      image_url, dietary_tags, difficulty, personal_notes, ingredients,
    } = req.body;

    const recipeResult = await client.query(`
      INSERT INTO recipes (name, description, source_url, category, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber, image_url, dietary_tags, difficulty, personal_notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [name, description, source_url, category, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber,
        image_url ?? null, dietary_tags ?? [], difficulty ?? 'medium', personal_notes ?? null]);

    const recipe = recipeResult.rows[0];

    if (ingredients && ingredients.length > 0) {
      for (const ing of ingredients) {
        let ingredientId = ing.ingredient_id;
        if (!ingredientId && ing.name) {
          const cat = ing.category || await categorizeIngredient(ing.name);
          const ingResult = await client.query(`
            INSERT INTO ingredients (name, category) VALUES ($1, $2)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id
          `, [ing.name, cat]);
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
  const client = await pool.connect();
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const scrapedData = await scrapeRecipe(url);
    console.log('Scraped recipe data:', JSON.stringify(scrapedData, null, 2));

    await client.query('BEGIN');

    const recipeResult = await client.query(`
      INSERT INTO recipes (name, description, source_url, category, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber, image_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      scrapedData.name, scrapedData.description, url, scrapedData.category ?? null,
      scrapedData.servings || 4, scrapedData.prep_time, scrapedData.cook_time,
      scrapedData.instructions, scrapedData.calories, scrapedData.protein,
      scrapedData.carbs, scrapedData.fat, scrapedData.fiber,
      scrapedData.image_url ?? null,
    ]);

    const recipe = recipeResult.rows[0];

    if (scrapedData.ingredients && scrapedData.ingredients.length > 0) {
      for (const ing of scrapedData.ingredients) {
        const cat = await categorizeIngredient(ing.name);
        const ingResult = await client.query(`
          INSERT INTO ingredients (name, category) VALUES ($1,$2)
          ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id
        `, [ing.name, cat]);
        const ingredientId = ingResult.rows[0].id;
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
    console.error('Error importing recipe:', error);
    res.status(500).json({ error: 'Failed to import recipe from URL' });
  } finally {
    client.release();
  }
});

// Update recipe
router.put('/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });

    const existingResult = await client.query('SELECT * FROM recipes WHERE id = $1', [id]);
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
      WHERE id=$18
    `, [name, description, source_url, category, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber, image_url,
        dietary_tags, difficulty, personal_notes, id]);

    if (ingredients !== undefined) {
      await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [id]);
      if (ingredients.length > 0) {
        for (const ing of ingredients) {
          let ingredientId = ing.ingredient_id;
          if (!ingredientId && ing.name) {
            const cat = ing.category || await categorizeIngredient(ing.name);
            const ingResult = await client.query(`
              INSERT INTO ingredients (name, category) VALUES ($1,$2)
              ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id
            `, [ing.name, cat]);
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
      'UPDATE recipes SET is_favorite = NOT is_favorite WHERE id = $1 RETURNING is_favorite',
      [id]
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
    await pool.query('DELETE FROM recipes WHERE id = $1', [id]);
    res.json({ message: 'Recipe deleted successfully' });
  } catch (error) {
    console.error('Error deleting recipe:', error);
    res.status(500).json({ error: 'Failed to delete recipe' });
  }
});

// Filter recipes by nutritional goals
router.get('/filter/nutritional', async (req: Request, res: Response) => {
  try {
    const { maxCarbs, minProtein, dietaryTag } = req.query;

    let query = RECIPE_SELECT + ' WHERE 1=1';
    const params: any[] = [];
    let p = 1;

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

// Import recipe from Spoonacular by ID
router.post('/import-spoonacular/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const spoonacularId = parseInt(req.params.id);
    console.log(`📥 Importing recipe from Spoonacular ID: ${spoonacularId}`);

    const spoonacularRecipe = await getRecipeDetails(spoonacularId);

    await client.query('BEGIN');

    const recipeResult = await client.query(`
      INSERT INTO recipes (name, description, source_url, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber, image_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [
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
        'SELECT id FROM ingredients WHERE LOWER(name) = LOWER($1)', [ingredient.name]
      );
      let ingredientId: number;
      if (ingredientResult.rows.length > 0) {
        ingredientId = ingredientResult.rows[0].id;
      } else {
        const cat = await categorizeIngredient(ingredient.name);
        const newIngredient = await client.query(
          'INSERT INTO ingredients (name, category) VALUES ($1,$2) RETURNING id',
          [ingredient.name, cat]
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
