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
      'SELECT * FROM budgets WHERE week_start_date = $1 AND household_id = $2',
      [week_start_date, req.householdId]
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
    const result = await pool.query(
      'SELECT * FROM budgets WHERE household_id = $1 ORDER BY week_start_date DESC',
      [req.householdId]
    );
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
      'SELECT SUM(estimated_price * quantity) as total FROM grocery_list WHERE week_start_date = $1 AND household_id = $2',
      [week_start_date, req.householdId]
    );

    const estimatedCost = groceryResult.rows[0]?.total || 0;

    const result = await pool.query(`
      INSERT INTO budgets (household_id, week_start_date, budget_amount, estimated_cost, calorie_budget)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (household_id, week_start_date)
      DO UPDATE SET
        budget_amount = EXCLUDED.budget_amount,
        estimated_cost = EXCLUDED.estimated_cost,
        calorie_budget = EXCLUDED.calorie_budget
      RETURNING *
    `, [req.householdId, week_start_date, budget_amount, estimatedCost, calorie_budget ?? null]);

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

    // Upsert so recording spend works even when no budget was set for the week
    const result = await pool.query(`
      INSERT INTO budgets (household_id, week_start_date, budget_amount, actual_cost)
      VALUES ($1, $2, 0, $3)
      ON CONFLICT (household_id, week_start_date)
      DO UPDATE SET actual_cost = EXCLUDED.actual_cost
      RETURNING *
    `, [req.householdId, week_start_date, actual_cost]);

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
      'SELECT SUM(estimated_price * quantity) as total FROM grocery_list WHERE week_start_date = $1 AND household_id = $2',
      [week_start_date, req.householdId]
    );

    const estimatedCost = groceryResult.rows[0]?.total || 0;

    const result = await pool.query(`
      UPDATE budgets
      SET estimated_cost = $1
      WHERE week_start_date = $2 AND household_id = $3
      RETURNING *
    `, [estimatedCost, week_start_date, req.householdId]);

    if (result.rows.length === 0) {
      // Create budget if it doesn't exist
      const createResult = await pool.query(`
        INSERT INTO budgets (household_id, week_start_date, budget_amount, estimated_cost)
        VALUES ($1, $2, 0, $3)
        RETURNING *
      `, [req.householdId, week_start_date, estimatedCost]);

      return res.json(createResult.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error recalculating budget:', error);
    res.status(500).json({ error: 'Failed to recalculate budget' });
  }
});

// Monthly history: estimated vs actual spend over time. Each week is
// attributed to the month its start date falls in.
router.get('/history', async (req: Request, res: Response) => {
  try {
    const months = Math.min(parseInt(req.query.months as string) || 6, 24);

    const result = await pool.query(`
      SELECT
        to_char(b.week_start_date, 'YYYY-MM') AS month,
        COALESCE(SUM(b.estimated_cost), 0) AS estimated_cost,
        COALESCE(SUM(b.actual_cost), 0) AS actual_cost,
        COALESCE(MAX(mb.budget_amount), 0) AS budget_amount
      FROM budgets b
      LEFT JOIN monthly_budgets mb
        ON mb.household_id = b.household_id
        AND mb.month = to_char(b.week_start_date, 'YYYY-MM')
      WHERE b.household_id = $1
        AND b.week_start_date >= date_trunc('month', CURRENT_DATE) - ($2 - 1) * INTERVAL '1 month'
      GROUP BY to_char(b.week_start_date, 'YYYY-MM')
      ORDER BY month DESC
    `, [req.householdId, months]);

    res.json(result.rows.map(row => ({
      month: row.month,
      estimated_cost: parseFloat(row.estimated_cost),
      actual_cost: parseFloat(row.actual_cost),
      budget_amount: parseFloat(row.budget_amount),
    })));
  } catch (error) {
    console.error('Error fetching budget history:', error);
    res.status(500).json({ error: 'Failed to fetch budget history' });
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
      'SELECT * FROM monthly_budgets WHERE month = $1 AND household_id = $2',
      [month, req.householdId]
    );

    // Aggregate estimated and actual costs from weekly budgets that overlap this month.
    // A week (7 days starting at week_start_date) overlaps if:
    //   week_start_date <= last day of month AND week_start_date + 6 days >= first day of month
    const weeklyResult = await pool.query(`
      SELECT
        COALESCE(SUM(estimated_cost), 0) AS estimated_cost,
        COALESCE(SUM(actual_cost), 0) AS actual_cost
      FROM budgets
      WHERE household_id = $3
        AND week_start_date <= $1
        AND week_start_date + INTERVAL '6 days' >= $2
    `, [lastDayStr, firstDay, req.householdId]);

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
      INSERT INTO monthly_budgets (household_id, month, budget_amount, calorie_budget, protein_goal, carbs_goal, fat_goal)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (household_id, month) DO UPDATE SET
        budget_amount = EXCLUDED.budget_amount,
        calorie_budget = EXCLUDED.calorie_budget,
        protein_goal = EXCLUDED.protein_goal,
        carbs_goal = EXCLUDED.carbs_goal,
        fat_goal = EXCLUDED.fat_goal
    `, [req.householdId, month, budget_amount, calorie_budget ?? null, protein_goal ?? null, carbs_goal ?? null, fat_goal ?? null]);

    // Re-fetch with aggregated costs
    const [year, mon] = month.split('-').map(Number);
    const firstDay = `${month}-01`;
    const lastDay = new Date(year, mon, 0).toISOString().split('T')[0];
    const weeklyResult = await pool.query(`
      SELECT
        COALESCE(SUM(estimated_cost), 0) AS estimated_cost,
        COALESCE(SUM(actual_cost), 0) AS actual_cost
      FROM budgets
      WHERE household_id = $3
        AND week_start_date <= $1
        AND week_start_date + INTERVAL '6 days' >= $2
    `, [lastDay, firstDay, req.householdId]);

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
