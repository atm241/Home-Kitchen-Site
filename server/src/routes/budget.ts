import express, { Request, Response } from 'express';
import pool from '../config/database';

const router = express.Router();

// Get budget for a specific week
router.get('/', async (req: Request, res: Response) => {
  try {
    const { week_start_date } = req.query;

    if (!week_start_date) {
      return res.status(400).json({ error: 'week_start_date is required' });
    }

    const result = await pool.query(
      'SELECT * FROM budgets WHERE week_start_date = $1',
      [week_start_date]
    );

    if (result.rows.length === 0) {
      // Return default budget structure if none exists
      return res.json({
        week_start_date,
        budget_amount: 0,
        estimated_cost: 0,
        actual_cost: 0
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching budget:', error);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

// Get all budgets
router.get('/all', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM budgets ORDER BY week_start_date DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching budgets:', error);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// Create or update budget
router.post('/', async (req: Request, res: Response) => {
  try {
    const { week_start_date, budget_amount, calorie_budget } = req.body;

    if (!week_start_date || budget_amount === undefined) {
      return res.status(400).json({ error: 'week_start_date and budget_amount are required' });
    }

    // Calculate estimated cost from grocery list
    const groceryResult = await pool.query(
      'SELECT SUM(estimated_price * quantity) as total FROM grocery_list WHERE week_start_date = $1',
      [week_start_date]
    );

    const estimatedCost = groceryResult.rows[0]?.total || 0;

    const result = await pool.query(`
      INSERT INTO budgets (week_start_date, budget_amount, estimated_cost, calorie_budget)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (week_start_date)
      DO UPDATE SET
        budget_amount = EXCLUDED.budget_amount,
        estimated_cost = EXCLUDED.estimated_cost,
        calorie_budget = EXCLUDED.calorie_budget
      RETURNING *
    `, [week_start_date, budget_amount, estimatedCost, calorie_budget ?? null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating/updating budget:', error);
    res.status(500).json({ error: 'Failed to create/update budget' });
  }
});

// Update actual cost
router.patch('/:week_start_date/actual', async (req: Request, res: Response) => {
  try {
    const { week_start_date } = req.params;
    const { actual_cost } = req.body;

    if (actual_cost === undefined) {
      return res.status(400).json({ error: 'actual_cost is required' });
    }

    const result = await pool.query(`
      UPDATE budgets
      SET actual_cost = $1
      WHERE week_start_date = $2
      RETURNING *
    `, [actual_cost, week_start_date]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating actual cost:', error);
    res.status(500).json({ error: 'Failed to update actual cost' });
  }
});

// Recalculate estimated cost from grocery list
router.post('/:week_start_date/recalculate', async (req: Request, res: Response) => {
  try {
    const { week_start_date } = req.params;

    const groceryResult = await pool.query(
      'SELECT SUM(estimated_price * quantity) as total FROM grocery_list WHERE week_start_date = $1',
      [week_start_date]
    );

    const estimatedCost = groceryResult.rows[0]?.total || 0;

    const result = await pool.query(`
      UPDATE budgets
      SET estimated_cost = $1
      WHERE week_start_date = $2
      RETURNING *
    `, [estimatedCost, week_start_date]);

    if (result.rows.length === 0) {
      // Create budget if it doesn't exist
      const createResult = await pool.query(`
        INSERT INTO budgets (week_start_date, budget_amount, estimated_cost)
        VALUES ($1, 0, $2)
        RETURNING *
      `, [week_start_date, estimatedCost]);

      return res.json(createResult.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error recalculating budget:', error);
    res.status(500).json({ error: 'Failed to recalculate budget' });
  }
});

export default router;
