import pool from '../config/database';
import { normalizeIngredients } from './ingredientNormalizer';
import { scrapeRecipe } from './recipeScraper';
import { categorizeIngredient } from './ingredientCategorizer';
import { categorizeRecipe } from './recipeCategorizer';
import { ImportError, Platform, importVideoRecipe, normalizeSharedLink } from './videoRecipeImporter';

export { ImportError };

export interface RecipeInsert {
  name: string;
  description?: string;
  category?: string;
  servings?: number;
  prep_time?: number;
  cook_time?: number;
  instructions?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  image_url?: string;
  source_url: string;
  source_platform: Platform;
  source_author?: string;
  ingredients?: Array<{ name: string; quantity?: number; unit?: string; notes?: string }>;
}

/** Insert a recipe and its ingredients in one transaction. Returns the new id. */
export async function insertRecipe(householdId: number, data: RecipeInsert): Promise<number> {
  // Map the source's own category label into one of the app's fixed categories.
  const category = await categorizeRecipe(data.name, data.description, data.category);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const recipeResult = await client.query(`
      INSERT INTO recipes (household_id, name, description, source_url, category, servings, prep_time, cook_time,
        instructions, calories, protein, carbs, fat, fiber, image_url, source_platform, source_author)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING id
    `, [
      householdId, data.name, data.description ?? null, data.source_url, category,
      data.servings || 4, data.prep_time ?? null, data.cook_time ?? null,
      data.instructions ?? null, data.calories ?? null, data.protein ?? null,
      data.carbs ?? null, data.fat ?? null, data.fiber ?? null,
      data.image_url ?? null, data.source_platform, data.source_author ?? null,
    ]);
    const recipeId = recipeResult.rows[0].id;

    for (const ing of data.ingredients || []) {
      const cat = await categorizeIngredient(ing.name);
      const ingResult = await client.query(`
        INSERT INTO ingredients (household_id, name, category) VALUES ($1,$2,$3)
        ON CONFLICT (household_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id
      `, [householdId, ing.name, cat]);
      await client.query(`
        INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (recipe_id, ingredient_id) DO UPDATE
          SET quantity = COALESCE(recipe_ingredients.quantity,0) + COALESCE(EXCLUDED.quantity,0)
      `, [recipeId, ingResult.rows[0].id, ing.quantity ?? null, ing.unit ?? null, ing.notes ?? null]);
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

export interface LinkImportResult {
  recipeId: number;
  /** True when this household had already saved the same link. */
  duplicate: boolean;
  platform: Platform;
}

/**
 * Import any shared link: a TikTok/YouTube/Instagram video or a regular
 * recipe website. Links already in the cookbook return the existing recipe.
 */
export async function importFromLink(householdId: number, rawUrl: string): Promise<LinkImportResult> {
  const { url, platform } = await normalizeSharedLink(rawUrl);

  const existing = await pool.query(
    'SELECT id FROM recipes WHERE household_id = $1 AND source_url = $2 LIMIT 1',
    [householdId, url]
  );
  if (existing.rows.length > 0) {
    return { recipeId: existing.rows[0].id, duplicate: true, platform };
  }

  if (platform === 'web') {
    const scraped = await scrapeRecipe(url).catch(() => null);
    if (!scraped?.name) {
      throw new ImportError("Couldn't find a recipe on that page.");
    }
    const recipeId = await insertRecipe(householdId, {
      ...scraped,
      ingredients: await normalizeIngredients(scraped.ingredients ?? []),
      source_url: url,
      source_platform: 'web',
      source_author: hostLabel(url),
    });
    return { recipeId, duplicate: false, platform };
  }

  const video = await importVideoRecipe(url, platform);
  const recipeId = await insertRecipe(householdId, {
    ...video,
    image_url: video.imageUrl,
    source_url: url,
    source_platform: platform,
    source_author: video.author,
  });
  return { recipeId, duplicate: false, platform };
}

function hostLabel(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}
