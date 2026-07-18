import express, { Request, Response } from 'express';
import pool from '../config/database';

const router = express.Router();

// Get all scheduled meals
router.get('/', async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    let query = `
      SELECT sm.*, r.name as recipe_name, r.description as recipe_description
      FROM scheduled_meals sm
      JOIN recipes r ON sm.recipe_id = r.id
      WHERE sm.household_id = $1
    `;

    const params: any[] = [req.householdId];

    if (start_date) {
      params.push(start_date);
      query += ` AND sm.meal_date >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND sm.meal_date <= $${params.length}`;
    }

    query += ' ORDER BY sm.meal_date ASC, sm.meal_type ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching scheduled meals:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled meals' });
  }
});

// Get single scheduled meal
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const result = await pool.query(`
      SELECT sm.*, r.name as recipe_name, r.description as recipe_description
      FROM scheduled_meals sm
      JOIN recipes r ON sm.recipe_id = r.id
      WHERE sm.id = $1 AND sm.household_id = $2
    `, [id, req.householdId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled meal not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching scheduled meal:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled meal' });
  }
});

// Schedule a meal
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      recipe_id,
      meal_date,
      meal_type,
      servings,
      is_recurring,
      recurrence_pattern,
      recurrence_end_date,
      notes
    } = req.body;

    const result = await pool.query(`
      INSERT INTO scheduled_meals (
        household_id, recipe_id, meal_date, meal_type, servings, is_recurring,
        recurrence_pattern, recurrence_end_date, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      req.householdId,
      recipe_id,
      meal_date,
      meal_type,
      servings,
      is_recurring || false,
      recurrence_pattern,
      recurrence_end_date,
      notes
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error scheduling meal:', error);
    res.status(500).json({ error: 'Failed to schedule meal' });
  }
});

// Update scheduled meal
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const {
      recipe_id,
      meal_date,
      meal_type,
      servings,
      is_recurring,
      recurrence_pattern,
      recurrence_end_date,
      notes
    } = req.body;

    const result = await pool.query(`
      UPDATE scheduled_meals
      SET recipe_id = $1, meal_date = $2, meal_type = $3, servings = $4,
          is_recurring = $5, recurrence_pattern = $6, recurrence_end_date = $7, notes = $8
      WHERE id = $9 AND household_id = $10
      RETURNING *
    `, [
      recipe_id,
      meal_date,
      meal_type,
      servings,
      is_recurring,
      recurrence_pattern,
      recurrence_end_date,
      notes,
      id,
      req.householdId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled meal not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating scheduled meal:', error);
    res.status(500).json({ error: 'Failed to update scheduled meal' });
  }
});

// Delete scheduled meal
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    await pool.query('DELETE FROM scheduled_meals WHERE id = $1 AND household_id = $2', [id, req.householdId]);
    res.json({ message: 'Scheduled meal deleted successfully' });
  } catch (error) {
    console.error('Error deleting scheduled meal:', error);
    res.status(500).json({ error: 'Failed to delete scheduled meal' });
  }
});

// Get meal portions (leftovers tracking)
router.get('/portions/:scheduled_meal_id', async (req: Request, res: Response) => {
  try {
    const scheduled_meal_id = parseInt(req.params.scheduled_meal_id, 10);
    if (isNaN(scheduled_meal_id) || scheduled_meal_id <= 0) return res.status(400).json({ error: 'Invalid ID' });
    const result = await pool.query(`
      SELECT mp.* FROM meal_portions mp
      JOIN scheduled_meals sm ON mp.scheduled_meal_id = sm.id
      WHERE mp.scheduled_meal_id = $1 AND sm.household_id = $2
      ORDER BY mp.date_made DESC
    `, [scheduled_meal_id, req.householdId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching meal portions:', error);
    res.status(500).json({ error: 'Failed to fetch meal portions' });
  }
});

export default router;
