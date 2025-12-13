import express, { Request, Response } from 'express';
import pool from '../config/database';
import { findRecipesByIngredients } from '../services/spoonacularService';
import { findIngredientCombos } from '../services/ingredientRecommender';
import crypto from 'crypto';

const router = express.Router();

// Helper function to create a signature from pantry items
function createPantrySignature(ingredientNames: string[]): string {
  return crypto.createHash('md5').update(ingredientNames.sort().join(',')).digest('hex');
}

// Get recipe recommendations based on pantry items
router.get('/', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    console.log(`📋 Fetching pantry items for recipe recommendations${forceRefresh ? ' (force refresh)' : ''}`);

    // Get all pantry items
    const pantryResult = await pool.query(`
      SELECT i.name, i.category, p.quantity, p.unit
      FROM pantry p
      JOIN ingredients i ON p.ingredient_id = i.id
      WHERE p.quantity > 0 OR p.is_staple = true
      ORDER BY i.name ASC
    `);

    if (pantryResult.rows.length === 0) {
      return res.json([]);
    }

    // Extract ingredient names and create signature
    const ingredientNames = pantryResult.rows.map(row => row.name);
    const pantrySignature = createPantrySignature(ingredientNames);

    // Always check cache first
    const cachedResult = await pool.query(`
      SELECT recommendations
      FROM cached_recipe_recommendations
      WHERE pantry_signature = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [pantrySignature]);

    // If we have cached data and not forcing refresh, return it
    if (cachedResult.rows.length > 0 && !forceRefresh) {
      console.log(`✅ Returning ${cachedResult.rows[0].recommendations.length} cached recipe recommendations`);
      return res.json(cachedResult.rows[0].recommendations);
    }

    // Only fetch from API if explicitly requested with refresh=true
    if (!forceRefresh) {
      console.log(`ℹ️  No cached recommendations found. Use refresh=true to fetch new recommendations.`);
      return res.json([]);
    }

    console.log(`🔍 Searching for recipes using ${ingredientNames.length} pantry ingredients`);

    // Get recipe recommendations from Spoonacular
    const recommendations = await findRecipesByIngredients(ingredientNames, 2);

    // Cache the results (no expiration - only refresh on demand)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 10); // Set far future expiration

    await pool.query(`
      INSERT INTO cached_recipe_recommendations (pantry_signature, recommendations, expires_at)
      VALUES ($1, $2, $3)
    `, [pantrySignature, JSON.stringify(recommendations), expiresAt]);

    console.log(`✅ Cached and returning ${recommendations.length} recipe recommendations`);

    res.json(recommendations);
  } catch (error) {
    console.error('❌ Error fetching recipe recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recipe recommendations' });
  }
});

// Get ingredient combo recommendations
router.get('/ingredient-combos', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    console.log(`📋 Fetching pantry items for ingredient combo recommendations${forceRefresh ? ' (force refresh)' : ''}`);

    // Get all pantry items
    const pantryResult = await pool.query(`
      SELECT i.name, i.category, p.quantity, p.unit
      FROM pantry p
      JOIN ingredients i ON p.ingredient_id = i.id
      WHERE p.quantity > 0 OR p.is_staple = true
      ORDER BY i.name ASC
    `);

    if (pantryResult.rows.length === 0) {
      return res.json([]);
    }

    // Extract ingredient names and create signature
    const ingredientNames = pantryResult.rows.map(row => row.name);
    const pantrySignature = createPantrySignature(ingredientNames);

    // Always check cache first
    const cachedResult = await pool.query(`
      SELECT combos
      FROM cached_ingredient_combos
      WHERE pantry_signature = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [pantrySignature]);

    // If we have cached data and not forcing refresh, return it
    if (cachedResult.rows.length > 0 && !forceRefresh) {
      console.log(`✅ Returning ${cachedResult.rows[0].combos.length} cached ingredient combo recommendations`);
      return res.json(cachedResult.rows[0].combos);
    }

    // Only fetch from API if explicitly requested with refresh=true
    if (!forceRefresh) {
      console.log(`ℹ️  No cached ingredient combos found. Use refresh=true to fetch new combos.`);
      return res.json([]);
    }

    console.log(`🔍 Searching for ingredient combos using ${ingredientNames.length} pantry ingredients`);

    // Get ingredient combo recommendations
    const combos = await findIngredientCombos(ingredientNames, 5);

    // Cache the results (no expiration - only refresh on demand)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 10); // Set far future expiration

    await pool.query(`
      INSERT INTO cached_ingredient_combos (pantry_signature, combos, expires_at)
      VALUES ($1, $2, $3)
    `, [pantrySignature, JSON.stringify(combos), expiresAt]);

    console.log(`✅ Cached and returning ${combos.length} ingredient combo recommendations`);

    res.json(combos);
  } catch (error) {
    console.error('❌ Error fetching ingredient combo recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch ingredient combo recommendations' });
  }
});

export default router;
