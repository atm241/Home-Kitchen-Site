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

// Get monthly budget + aggregated costs from all overlapping weeks
router.get('/monthly', async (req: Request, res: Response) => {
  try {
    const { month } = req.query; // expects YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month as string)) {
      return res.status(400).json({ error: 'month is required in YYYY-MM format' });
    }

    const [year, mon] = (month as string).split('-').map(Number);
    const firstDay = `${month}-01`;
    const lastDay = new Date(year, mon, 0); // last day of month
    const lastDayStr = lastDay.toISOString().split('T')[0];

    // Get monthly budget settings
    const monthlyResult = await pool.query(
      'SELECT * FROM monthly_budgets WHERE month = $1',
      [month]
    );

    // Aggregate estimated and actual costs from weekly budgets that overlap this month.
    // A week (7 days starting at week_start_date) overlaps if:
    //   week_start_date <= last day of month AND week_start_date + 6 days >= first day of month
    const weeklyResult = await pool.query(`
      SELECT
        COALESCE(SUM(estimated_cost), 0) AS estimated_cost,
        COALESCE(SUM(actual_cost), 0) AS actual_cost
      FROM budgets
      WHERE week_start_date <= $1
        AND week_start_date + INTERVAL '6 days' >= $2
    `, [lastDayStr, firstDay]);

    const monthly = monthlyResult.rows[0];
    const agg = weeklyResult.rows[0];

    res.json({
      month,
      budget_amount: monthly?.budget_amount ?? 0,
      calorie_budget: monthly?.calorie_budget ?? null,
      protein_goal: monthly?.protein_goal ?? null,
      carbs_goal: monthly?.carbs_goal ?? null,
      fat_goal: monthly?.fat_goal ?? null,
      estimated_cost: parseFloat(agg.estimated_cost),
      actual_cost: parseFloat(agg.actual_cost),
    });
  } catch (error) {
    console.error('Error fetching monthly budget:', error);
    res.status(500).json({ error: 'Failed to fetch monthly budget' });
  }
});

// Create or update monthly budget
router.post('/monthly', async (req: Request, res: Response) => {
  try {
    const { month, budget_amount, calorie_budget, protein_goal, carbs_goal, fat_goal } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month is required in YYYY-MM format' });
    }
    if (budget_amount === undefined) {
      return res.status(400).json({ error: 'budget_amount is required' });
    }

    await pool.query(`
      INSERT INTO monthly_budgets (month, budget_amount, calorie_budget, protein_goal, carbs_goal, fat_goal)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (month) DO UPDATE SET
        budget_amount = EXCLUDED.budget_amount,
        calorie_budget = EXCLUDED.calorie_budget,
        protein_goal = EXCLUDED.protein_goal,
        carbs_goal = EXCLUDED.carbs_goal,
        fat_goal = EXCLUDED.fat_goal
    `, [month, budget_amount, calorie_budget ?? null, protein_goal ?? null, carbs_goal ?? null, fat_goal ?? null]);

    // Re-fetch with aggregated costs
    const [year, mon] = month.split('-').map(Number);
    const firstDay = `${month}-01`;
    const lastDay = new Date(year, mon, 0).toISOString().split('T')[0];
    const weeklyResult = await pool.query(`
      SELECT
        COALESCE(SUM(estimated_cost), 0) AS estimated_cost,
        COALESCE(SUM(actual_cost), 0) AS actual_cost
      FROM budgets
      WHERE week_start_date <= $1
        AND week_start_date + INTERVAL '6 days' >= $2
    `, [lastDay, firstDay]);

    const agg = weeklyResult.rows[0];
    res.status(201).json({
      month,
      budget_amount,
      calorie_budget: calorie_budget ?? null,
      protein_goal: protein_goal ?? null,
      carbs_goal: carbs_goal ?? null,
      fat_goal: fat_goal ?? null,
      estimated_cost: parseFloat(agg.estimated_cost),
      actual_cost: parseFloat(agg.actual_cost),
    });
  } catch (error) {
    console.error('Error creating/updating monthly budget:', error);
    res.status(500).json({ error: 'Failed to create/update monthly budget' });
  }
});

export default router;
