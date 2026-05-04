import express, { Request, Response } from 'express';
import pool from '../config/database';

const router = express.Router();

// Get cook history (most recent first)
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await pool.query(
      `SELECT ch.*, r.image_url, r.category, r.calories
       FROM cook_history ch
       LEFT JOIN recipes r ON ch.recipe_id = r.id
       ORDER BY ch.cooked_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching cook history:', error);
    res.status(500).json({ error: 'Failed to fetch cook history' });
  }
});

// Log a cook event
router.post('/', async (req: Request, res: Response) => {
  try {
    const { recipe_id, recipe_name, servings_cooked } = req.body;
    if (!recipe_name) return res.status(400).json({ error: 'recipe_name is required' });

    const result = await pool.query(
      `INSERT INTO cook_history (recipe_id, recipe_name, servings_cooked)
       VALUES ($1, $2, $3) RETURNING *`,
      [recipe_id ?? null, recipe_name, servings_cooked ?? null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error logging cook history:', error);
    res.status(500).json({ error: 'Failed to log cook history' });
  }
});

// Delete a cook history entry
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    await pool.query('DELETE FROM cook_history WHERE id = $1', [id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Error deleting cook history entry:', error);
    res.status(500).json({ error: 'Failed to delete cook history entry' });
  }
});

export default router;
