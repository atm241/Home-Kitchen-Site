import express, { Request, Response } from 'express';
import pool from '../config/database';
import { scrapeRecipe } from '../services/recipeScraper';
import { categorizeIngredient } from '../services/ingredientCategorizer';
import { getRecipeDetails } from '../services/spoonacularService';

const router = express.Router();

// Get all recipes
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT r.*,
        json_agg(
          json_build_object(
            'ingredient_id', ri.ingredient_id,
            'name', i.name,
            'quantity', ri.quantity,
            'unit', ri.unit,
            'notes', ri.notes
          )
        ) as ingredients
      FROM recipes r
      LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
      LEFT JOIN ingredients i ON ri.ingredient_id = i.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
});

// Get single recipe
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
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
      WHERE r.id = $1
      GROUP BY r.id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

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
      name,
      description,
      source_url,
      category,
      servings,
      prep_time,
      cook_time,
      instructions,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      ingredients
    } = req.body;

    // Insert recipe
    const recipeResult = await client.query(`
      INSERT INTO recipes (name, description, source_url, category, servings, prep_time, cook_time, instructions, calories, protein, carbs, fat, fiber)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [name, description, source_url, category, servings, prep_time, cook_time, instructions, calories, protein, carbs, fat, fiber]);

    const recipe = recipeResult.rows[0];

    // Insert ingredients
    if (ingredients && ingredients.length > 0) {
      for (const ing of ingredients) {
        // Check if ingredient exists, if not create it
        let ingredientId = ing.ingredient_id;
        if (!ingredientId && ing.name) {
          // Use AI categorization if category not provided
          const category = ing.category || await categorizeIngredient(ing.name);
          const ingResult = await client.query(`
            INSERT INTO ingredients (name, category)
            VALUES ($1, $2)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
          `, [ing.name, category]);
          ingredientId = ingResult.rows[0].id;
        }

        // Link ingredient to recipe
        await client.query(`
          INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
          VALUES ($1, $2, $3, $4, $5)
        `, [recipe.id, ingredientId, ing.quantity, ing.unit, ing.notes]);
      }
    }

    await client.query('COMMIT');

    // Fetch the complete recipe with ingredients
    const completeRecipe = await pool.query(`
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
      WHERE r.id = $1
      GROUP BY r.id
    `, [recipe.id]);

    res.status(201).json(completeRecipe.rows[0]);
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

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Scrape the recipe data
    const scrapedData = await scrapeRecipe(url);

    console.log('Scraped recipe data:', JSON.stringify(scrapedData, null, 2));

    await client.query('BEGIN');

    // Insert recipe into database
    const recipeResult = await client.query(`
      INSERT INTO recipes (name, description, source_url, category, servings, prep_time, cook_time, instructions, calories, protein, carbs, fat, fiber)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      scrapedData.name,
      scrapedData.description,
      url,
      scrapedData.category || null,
      scrapedData.servings || 4, // Default to 4 servings if not provided
      scrapedData.prep_time,
      scrapedData.cook_time,
      scrapedData.instructions,
      scrapedData.calories,
      scrapedData.protein,
      scrapedData.carbs,
      scrapedData.fat,
      scrapedData.fiber
    ]);

    const recipe = recipeResult.rows[0];

    // Insert ingredients
    if (scrapedData.ingredients && scrapedData.ingredients.length > 0) {
      for (const ing of scrapedData.ingredients) {
        // Check if ingredient exists, if not create it with AI categorization
        const category = await categorizeIngredient(ing.name);
        const ingResult = await client.query(`
          INSERT INTO ingredients (name, category)
          VALUES ($1, $2)
          ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `, [ing.name, category]);

        const ingredientId = ingResult.rows[0].id;

        // Link ingredient to recipe
        await client.query(`
          INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
          VALUES ($1, $2, $3, $4, $5)
        `, [recipe.id, ingredientId, ing.quantity, ing.unit, ing.notes]);
      }
    }

    await client.query('COMMIT');

    // Fetch the complete recipe with ingredients
    const completeRecipe = await pool.query(`
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
      WHERE r.id = $1
      GROUP BY r.id
    `, [recipe.id]);

    res.status(201).json(completeRecipe.rows[0]);
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

    const { id } = req.params;

    // Get existing recipe first for partial updates
    const existingRecipe = await client.query('SELECT * FROM recipes WHERE id = $1', [id]);

    if (existingRecipe.rows.length === 0) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    const existing = existingRecipe.rows[0];

    // Merge existing data with updates
    const {
      name = existing.name,
      description = existing.description,
      source_url = existing.source_url,
      category = existing.category,
      servings = existing.servings,
      prep_time = existing.prep_time,
      cook_time = existing.cook_time,
      instructions = existing.instructions,
      calories = existing.calories,
      protein = existing.protein,
      carbs = existing.carbs,
      fat = existing.fat,
      fiber = existing.fiber,
      ingredients
    } = req.body;

    // Update recipe
    await client.query(`
      UPDATE recipes
      SET name = $1, description = $2, source_url = $3, category = $4, servings = $5,
          prep_time = $6, cook_time = $7, instructions = $8, calories = $9,
          protein = $10, carbs = $11, fat = $12, fiber = $13, updated_at = CURRENT_TIMESTAMP
      WHERE id = $14
    `, [name, description, source_url, category, servings, prep_time, cook_time, instructions, calories, protein, carbs, fat, fiber, id]);

    // Only update ingredients if provided in the request
    if (ingredients !== undefined) {
      // Delete existing recipe ingredients
      await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [id]);

      // Insert new ingredients
      if (ingredients.length > 0) {
        for (const ing of ingredients) {
          let ingredientId = ing.ingredient_id;
          if (!ingredientId && ing.name) {
            // Use AI categorization if category not provided
            const category = ing.category || await categorizeIngredient(ing.name);
            const ingResult = await client.query(`
              INSERT INTO ingredients (name, category)
              VALUES ($1, $2)
              ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
              RETURNING id
            `, [ing.name, category]);
            ingredientId = ingResult.rows[0].id;
          }

          await client.query(`
            INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
            VALUES ($1, $2, $3, $4, $5)
          `, [id, ingredientId, ing.quantity, ing.unit, ing.notes]);
        }
      }
    }

    await client.query('COMMIT');

    // Fetch updated recipe
    const result = await pool.query(`
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
      WHERE r.id = $1
      GROUP BY r.id
    `, [id]);

    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating recipe:', error);
    res.status(500).json({ error: 'Failed to update recipe' });
  } finally {
    client.release();
  }
});

// Delete recipe
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
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
    const { maxCarbs, minProtein, minVegetables } = req.query;

    let query = `
      SELECT DISTINCT r.*,
        json_agg(
          json_build_object(
            'ingredient_id', ri.ingredient_id,
            'name', i.name,
            'quantity', ri.quantity,
            'unit', ri.unit,
            'notes', ri.notes
          )
        ) as ingredients
      FROM recipes r
      LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
      LEFT JOIN ingredients i ON ri.ingredient_id = i.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 1;

    if (maxCarbs) {
      query += ` AND r.carbs <= $${paramCount}`;
      params.push(parseFloat(maxCarbs as string));
      paramCount++;
    }

    if (minProtein) {
      query += ` AND r.protein >= $${paramCount}`;
      params.push(parseFloat(minProtein as string));
      paramCount++;
    }

    // TODO: Add vegetable count logic if needed

    query += ` GROUP BY r.id ORDER BY r.created_at DESC`;

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

    // Get recipe details from Spoonacular
    const spoonacularRecipe = await getRecipeDetails(spoonacularId);

    await client.query('BEGIN');

    // Insert recipe into database
    const recipeResult = await client.query(`
      INSERT INTO recipes (
        name, description, source_url, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      spoonacularRecipe.title,
      spoonacularRecipe.summary.replace(/<[^>]*>/g, '').substring(0, 500),
      spoonacularRecipe.sourceUrl,
      spoonacularRecipe.servings,
      spoonacularRecipe.readyInMinutes,
      spoonacularRecipe.readyInMinutes, // Using readyInMinutes for both prep and cook
      spoonacularRecipe.instructions || '',
      spoonacularRecipe.nutrition?.nutrients.find((n: any) => n.name === 'Calories')?.amount || null,
      spoonacularRecipe.nutrition?.nutrients.find((n: any) => n.name === 'Protein')?.amount || null,
      spoonacularRecipe.nutrition?.nutrients.find((n: any) => n.name === 'Carbohydrates')?.amount || null,
      spoonacularRecipe.nutrition?.nutrients.find((n: any) => n.name === 'Fat')?.amount || null,
      spoonacularRecipe.nutrition?.nutrients.find((n: any) => n.name === 'Fiber')?.amount || null,
    ]);

    const recipe = recipeResult.rows[0];
    console.log(`✅ Recipe created with ID: ${recipe.id}`);

    // Insert ingredients
    for (const ingredient of spoonacularRecipe.extendedIngredients) {
      // Find or create ingredient
      let ingredientResult = await client.query(
        'SELECT id FROM ingredients WHERE LOWER(name) = LOWER($1)',
        [ingredient.name]
      );

      let ingredientId: number;
      if (ingredientResult.rows.length > 0) {
        ingredientId = ingredientResult.rows[0].id;
      } else {
        // Create new ingredient with AI categorization
        const category = await categorizeIngredient(ingredient.name);
        const newIngredient = await client.query(
          'INSERT INTO ingredients (name, category) VALUES ($1, $2) RETURNING id',
          [ingredient.name, category]
        );
        ingredientId = newIngredient.rows[0].id;
        console.log(`✅ Created ingredient: ${ingredient.name} (${category})`);
      }

      // Insert recipe ingredient
      await client.query(`
        INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        recipe.id,
        ingredientId,
        ingredient.amount || null,
        ingredient.unit || null,
        null
      ]);
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
