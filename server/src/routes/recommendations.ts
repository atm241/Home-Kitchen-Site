import express, { Request, Response } from 'express';
import pool from '../config/database';
import { findRecipesByIngredients } from '../services/spoonacularService';

const router = express.Router();

// Get recipe recommendations based on pantry items
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('📋 Fetching pantry items for recipe recommendations');

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

    // Extract ingredient names
    const ingredientNames = pantryResult.rows.map(row => row.name);

    console.log(`🔍 Searching for recipes using ${ingredientNames.length} pantry ingredients`);

    // Get recipe recommendations from Spoonacular
    const recommendations = await findRecipesByIngredients(ingredientNames, 2);

    console.log(`✅ Returning ${recommendations.length} recipe recommendations`);

    res.json(recommendations);
  } catch (error) {
    console.error('❌ Error fetching recipe recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recipe recommendations' });
  }
});

export default router;
