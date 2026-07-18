import express, { Request, Response } from 'express';
import pool from '../config/database';

const router = express.Router();

// Get all ingredients
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ingredients WHERE household_id = $1 ORDER BY name ASC',
      [req.householdId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching ingredients:', error);
    res.status(500).json({ error: 'Failed to fetch ingredients' });
  }
});

// Get single ingredient
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const result = await pool.query(
      'SELECT * FROM ingredients WHERE id = $1 AND household_id = $2',
      [id, req.householdId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching ingredient:', error);
    res.status(500).json({ error: 'Failed to fetch ingredient' });
  }
});

// Create new ingredient
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, category } = req.body;

    const result = await pool.query(
      'INSERT INTO ingredients (household_id, name, category) VALUES ($1, $2, $3) RETURNING *',
      [req.householdId, name, category]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating ingredient:', error);
    res.status(500).json({ error: 'Failed to create ingredient' });
  }
});

// Update ingredient
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const { name, category } = req.body;

    const result = await pool.query(
      'UPDATE ingredients SET name = $1, category = $2 WHERE id = $3 AND household_id = $4 RETURNING *',
      [name, category, id, req.householdId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating ingredient:', error);
    res.status(500).json({ error: 'Failed to update ingredient' });
  }
});

// Delete ingredient
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    await pool.query('DELETE FROM ingredients WHERE id = $1 AND household_id = $2', [id, req.householdId]);
    res.json({ message: 'Ingredient deleted successfully' });
  } catch (error) {
    console.error('Error deleting ingredient:', error);
    res.status(500).json({ error: 'Failed to delete ingredient' });
  }
});

export default router;
