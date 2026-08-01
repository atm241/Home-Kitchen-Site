import express, { Request, Response } from 'express';
import pool from '../config/database';
import { findRecipesByIngredients, RecipeRecommendation } from '../services/spoonacularService';
import { findIngredientCombos } from '../services/ingredientRecommender';
import { findSavedRecipeMatches } from '../services/savedRecipeRecommender';
import { createPantrySignature } from '../utils/pantrySignature';
import { cacheExpiry } from '../utils/recommendationCache';

const router = express.Router();

// Get recipe recommendations based on pantry items
router.get('/', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const householdId = req.householdId;
    console.log(`📋 Fetching pantry items for recipe recommendations${forceRefresh ? ' (force refresh)' : ''}`);

    // Get all pantry items
    const pantryResult = await pool.query(`
      SELECT i.name, i.category, p.quantity, p.unit
      FROM pantry p
      JOIN ingredients i ON p.ingredient_id = i.id
      WHERE p.household_id = $1 AND (p.quantity > 0 OR p.is_staple = true)
      ORDER BY i.name ASC
    `, [householdId]);

    if (pantryResult.rows.length === 0) {
      return res.json([]);
    }

    // Extract ingredient names and create signature
    const ingredientNames = pantryResult.rows.map(row => row.name);
    const pantrySignature = createPantrySignature(ingredientNames);

    // The household's own saved recipes are always ranked live against the
    // pantry — no API cost, and they reflect newly imported recipes without a
    // manual refresh. Only the Spoonacular half is cached/refresh-gated below.
    const savedMatches = await findSavedRecipeMatches(householdId!);

    // Check the Spoonacular cache
    const cachedResult = await pool.query(`
      SELECT recommendations, expires_at
      FROM cached_recipe_recommendations
      WHERE pantry_signature = $1 AND household_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [pantrySignature, householdId]);

    const hasCache = cachedResult.rows.length > 0;
    const cacheFresh = hasCache && new Date(cachedResult.rows[0].expires_at) > new Date();

    let spoonacularRecs: RecipeRecommendation[] = [];

    if (forceRefresh || (hasCache && !cacheFresh)) {
      console.log(`🔍 Searching Spoonacular using ${ingredientNames.length} pantry ingredients${!forceRefresh ? ' (cache expired)' : ''}`);
      spoonacularRecs = await findRecipesByIngredients(ingredientNames, 2);

      await pool.query(`
        INSERT INTO cached_recipe_recommendations (household_id, pantry_signature, recommendations, expires_at)
        VALUES ($1, $2, $3, $4)
      `, [householdId, pantrySignature, JSON.stringify(spoonacularRecs), cacheExpiry()]);
      console.log(`✅ Cached ${spoonacularRecs.length} Spoonacular recommendations`);
    } else if (hasCache) {
      spoonacularRecs = cachedResult.rows[0].recommendations;
      console.log(`✅ Using ${spoonacularRecs.length} cached Spoonacular recommendations`);
    } else {
      console.log(`ℹ️  No cached Spoonacular recommendations. Use refresh=true to fetch them.`);
    }

    // Merge saved-recipe matches with Spoonacular results, best match first.
    const merged = [...savedMatches, ...spoonacularRecs].sort(
      (a, b) => b.matchPercentage - a.matchPercentage
    );

    console.log(`✅ Returning ${merged.length} recommendations (${savedMatches.length} saved + ${spoonacularRecs.length} Spoonacular)`);
    res.json(merged);
  } catch (error) {
    console.error('❌ Error fetching recipe recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recipe recommendations' });
  }
});

// Get ingredient combo recommendations
router.get('/ingredient-combos', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const householdId = req.householdId;
    console.log(`📋 Fetching pantry items for ingredient combo recommendations${forceRefresh ? ' (force refresh)' : ''}`);

    // Get all pantry items
    const pantryResult = await pool.query(`
      SELECT i.name, i.category, p.quantity, p.unit
      FROM pantry p
      JOIN ingredients i ON p.ingredient_id = i.id
      WHERE p.household_id = $1 AND (p.quantity > 0 OR p.is_staple = true)
      ORDER BY i.name ASC
    `, [householdId]);

    if (pantryResult.rows.length === 0) {
      return res.json([]);
    }

    // Extract ingredient names and create signature
    const ingredientNames = pantryResult.rows.map(row => row.name);
    const pantrySignature = createPantrySignature(ingredientNames);

    // Always check cache first
    const cachedResult = await pool.query(`
      SELECT combos, expires_at
      FROM cached_ingredient_combos
      WHERE pantry_signature = $1 AND household_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [pantrySignature, householdId]);

    const hasCache = cachedResult.rows.length > 0;
    const cacheFresh = hasCache && new Date(cachedResult.rows[0].expires_at) > new Date();

    // If we have fresh cached data and not forcing refresh, return it
    if (cacheFresh && !forceRefresh) {
      console.log(`✅ Returning ${cachedResult.rows[0].combos.length} cached ingredient combo recommendations`);
      return res.json(cachedResult.rows[0].combos);
    }

    // With no cache at all, only fetch from the API on an explicit refresh;
    // an expired cache refetches automatically
    if (!forceRefresh && !hasCache) {
      console.log(`ℹ️  No cached ingredient combos found. Use refresh=true to fetch new combos.`);
      return res.json([]);
    }

    console.log(`🔍 Searching for ingredient combos using ${ingredientNames.length} pantry ingredients${!forceRefresh ? ' (cache expired)' : ''}`);

    // Get ingredient combo recommendations
    const combos = await findIngredientCombos(ingredientNames, 5);

    await pool.query(`
      INSERT INTO cached_ingredient_combos (household_id, pantry_signature, combos, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [householdId, pantrySignature, JSON.stringify(combos), cacheExpiry()]);

    console.log(`✅ Cached and returning ${combos.length} ingredient combo recommendations`);

    res.json(combos);
  } catch (error) {
    console.error('❌ Error fetching ingredient combo recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch ingredient combo recommendations' });
  }
});

export default router;
