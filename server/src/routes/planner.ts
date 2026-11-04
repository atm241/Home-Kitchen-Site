import express, { Request, Response } from 'express';
import pool from '../config/database';
import { receiptSpend } from './budget';
import {
  PlannerGoals, PlanMeal, Slot, SLOTS,
  loadContext, generatePlan, alternatives, summarize, recipeCard, addDays, weekStart, sortMeals, PlannerContext,
} from '../services/mealPlanner';

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIODS = [7, 14, 30];

const today = () => new Date().toISOString().slice(0, 10);

function optInt(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function parseGoals(raw: unknown): PlannerGoals {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const slots = Array.isArray(b.meal_slots)
    ? SLOTS.filter((s) => (b.meal_slots as unknown[]).includes(s))
    : [...SLOTS];
  const budget = Number(b.budget_amount);
  return {
    start_date: typeof b.start_date === 'string' && DATE_RE.test(b.start_date) ? b.start_date : today(),
    period_days: PERIODS.includes(Number(b.period_days)) ? Number(b.period_days) : 7,
    daily_calories: optInt(b.daily_calories, 800, 6000),
    protein_goal: optInt(b.protein_goal, 1, 400),
    fiber_goal: optInt(b.fiber_goal, 1, 150),
    carbs_limit: optInt(b.carbs_limit, 1, 800),
    fat_limit: optInt(b.fat_limit, 1, 400),
    meal_slots: slots.length ? slots : ['dinner'],
    servings: optInt(b.servings, 1, 12) ?? 2,
    budget_amount: Number.isFinite(budget) && budget > 0 && budget < 100000 ? Math.round(budget * 100) / 100 : null,
  };
}

function parseMeals(raw: unknown, goals: PlannerGoals): PlanMeal[] {
  if (!Array.isArray(raw)) return [];
  const end = addDays(goals.start_date, goals.period_days - 1);
  return raw.flatMap((m) => {
    if (!m || typeof m !== 'object') return [];
    const o = m as Record<string, unknown>;
    const slot = String(o.slot) as Slot;
    const date = String(o.date);
    const recipeId = Number(o.recipe_id);
    if (!SLOTS.includes(slot) || !DATE_RE.test(date) || date < goals.start_date || date > end) return [];
    if (!Number.isInteger(recipeId) || recipeId <= 0) return [];
    return [{
      date, slot, recipe_id: recipeId,
      servings: optInt(o.servings, 1, 24) ?? goals.servings,
      pinned: !!o.pinned,
      existing_id: Number.isInteger(o.existing_id) ? (o.existing_id as number) : undefined,
    }];
  }).slice(0, 200);
}

function cards(meals: PlanMeal[], ctx: PlannerContext, extraIds: number[] = []) {
  const out: Record<number, ReturnType<typeof recipeCard>> = {};
  for (const id of [...meals.map((m) => m.recipe_id), ...extraIds]) {
    const r = ctx.recipes.get(id);
    if (r) out[id] = recipeCard(r);
  }
  return out;
}

async function contextFor(householdId: number, goals: PlannerGoals) {
  return loadContext(householdId, goals.start_date, addDays(goals.start_date, goals.period_days - 1));
}

/** Current budget window (rolls forward from the saved start) and receipt spend in it. */
async function budgetStatus(householdId: number, prefs: Record<string, unknown> | undefined) {
  if (!prefs || !prefs.budget_amount) return null;
  const period = Number(prefs.period_days) || 7;
  let start = (prefs.budget_start as string) || today();
  const now = today();
  while (addDays(start, period - 1) < now) start = addDays(start, period);
  const end = addDays(start, period - 1);
  const spent = await receiptSpend(householdId, start, end);
  const amount = parseFloat(String(prefs.budget_amount));
  return { amount, period_days: period, start_date: start, end_date: end, spent, remaining: Math.round((amount - spent) * 100) / 100 };
}

async function loadPrefs(householdId: number) {
  const r = await pool.query(
    `SELECT *, to_char(budget_start_date, 'YYYY-MM-DD') AS budget_start FROM meal_plan_preferences WHERE household_id = $1`,
    [householdId]
  );
  return r.rows[0] as Record<string, unknown> | undefined;
}

// Saved goals (or defaults), cookbook size and budget status, for the Plan page and the planner form.
router.get('/status', async (req: Request, res: Response) => {
  try {
    const householdId = req.householdId!;
    const [prefs, countRes] = await Promise.all([
      loadPrefs(householdId),
      pool.query('SELECT COUNT(*)::int AS n FROM recipes WHERE household_id = $1', [householdId]),
    ]);
    const preferences = parseGoals(prefs ? {
      ...prefs,
      budget_amount: prefs.budget_amount,
      start_date: today(),
    } : { start_date: today() });
    res.json({
      saved: !!prefs,
      preferences,
      recipe_count: countRes.rows[0].n,
      budget: await budgetStatus(householdId, prefs),
    });
  } catch (error) {
    console.error('Error loading planner status:', error);
    res.status(500).json({ error: 'Failed to load planner' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const goals = parseGoals(req.body.goals);
    const ctx = await contextFor(req.householdId!, goals);
    if (ctx.recipes.size === 0) {
      return res.status(422).json({ error: 'Save a few recipes to your cookbook first, then Simmer can plan with them.' });
    }
    const pinned = parseMeals(req.body.pinned, goals);
    const seed = Number.isInteger(req.body.seed) ? req.body.seed : undefined;
    const { meals, warnings } = generatePlan(goals, ctx, { pinned, keepExisting: req.body.keep_existing !== false, seed });
    res.json({ meals, recipes: cards(meals, ctx), summary: summarize(meals, goals, ctx), warnings });
  } catch (error) {
    console.error('Error generating meal plan:', error);
    res.status(500).json({ error: 'Failed to build a meal plan' });
  }
});

// Recompute totals after the person edits the draft.
router.post('/evaluate', async (req: Request, res: Response) => {
  try {
    const goals = parseGoals(req.body.goals);
    const ctx = await contextFor(req.householdId!, goals);
    const meals = sortMeals(parseMeals(req.body.meals, goals).filter((m) => ctx.recipes.has(m.recipe_id)));
    res.json({ meals, recipes: cards(meals, ctx), summary: summarize(meals, goals, ctx) });
  } catch (error) {
    console.error('Error evaluating meal plan:', error);
    res.status(500).json({ error: 'Failed to update the plan' });
  }
});

router.post('/alternatives', async (req: Request, res: Response) => {
  try {
    const goals = parseGoals(req.body.goals);
    const slot = String(req.body.slot) as Slot;
    const date = String(req.body.date);
    if (!SLOTS.includes(slot) || !DATE_RE.test(date)) return res.status(400).json({ error: 'date and slot are required' });
    const ctx = await contextFor(req.householdId!, goals);
    const meals = parseMeals(req.body.meals, goals);
    const ids = alternatives(meals, { date, slot }, goals, ctx);
    res.json({ recipe_ids: ids, recipes: cards([], ctx, ids) });
  } catch (error) {
    console.error('Error finding alternatives:', error);
    res.status(500).json({ error: 'Failed to find other recipes' });
  }
});

// Save the plan: create the meals, remember the goals, and optionally fill the grocery list.
router.post('/commit', async (req: Request, res: Response) => {
  const householdId = req.householdId!;
  const goals = parseGoals(req.body.goals);
  const addToGrocery = req.body.add_to_grocery !== false;
  const client = await pool.connect();
  try {
    const ctx = await contextFor(householdId, goals);
    const meals = parseMeals(req.body.meals, goals).filter((m) => !m.existing_id && ctx.recipes.has(m.recipe_id));

    await client.query('BEGIN');

    for (const m of meals) {
      await client.query(
        `INSERT INTO scheduled_meals (household_id, recipe_id, meal_date, meal_type, servings)
         VALUES ($1, $2, $3, $4, $5)`,
        [householdId, m.recipe_id, m.date, m.slot, m.servings]
      );
    }

    await client.query(
      `INSERT INTO meal_plan_preferences
         (household_id, period_days, budget_amount, budget_start_date, daily_calories, protein_goal, fiber_goal,
          carbs_limit, fat_limit, meal_slots, servings, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
       ON CONFLICT (household_id) DO UPDATE SET
         period_days = EXCLUDED.period_days, budget_amount = EXCLUDED.budget_amount,
         budget_start_date = EXCLUDED.budget_start_date, daily_calories = EXCLUDED.daily_calories,
         protein_goal = EXCLUDED.protein_goal, fiber_goal = EXCLUDED.fiber_goal,
         carbs_limit = EXCLUDED.carbs_limit, fat_limit = EXCLUDED.fat_limit,
         meal_slots = EXCLUDED.meal_slots, servings = EXCLUDED.servings, updated_at = CURRENT_TIMESTAMP`,
      [householdId, goals.period_days, goals.budget_amount, goals.budget_amount ? goals.start_date : null,
       goals.daily_calories, goals.protein_goal, goals.fiber_goal, goals.carbs_limit, goals.fat_limit,
       goals.meal_slots, goals.servings]
    );

    // Keep the month's daily goals in sync so Plan and Calendar show the same targets.
    await client.query(
      `INSERT INTO monthly_budgets (household_id, month, budget_amount, calorie_budget, protein_goal, carbs_goal, fat_goal)
       VALUES ($1, $2, 0, $3, $4, $5, $6)
       ON CONFLICT (household_id, month) DO UPDATE SET
         calorie_budget = EXCLUDED.calorie_budget, protein_goal = EXCLUDED.protein_goal,
         carbs_goal = EXCLUDED.carbs_goal, fat_goal = EXCLUDED.fat_goal`,
      [householdId, goals.start_date.slice(0, 7), goals.daily_calories, goals.protein_goal, goals.carbs_limit, goals.fat_limit]
    );

    let groceryAdded = 0;
    const listWeek = weekStart(goals.start_date);
    if (addToGrocery && meals.length > 0) {
      groceryAdded = await addMealsToGrocery(client, householdId, meals, listWeek);
    }

    await client.query('COMMIT');
    res.status(201).json({ created: meals.length, grocery_added: groceryAdded, week_start_date: listWeek });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving meal plan:', error);
    res.status(500).json({ error: 'Failed to save the plan' });
  } finally {
    client.release();
  }
});

// Spellings of the same unit, so "2 cups" and "0.75 cup" end up on one line.
const UNIT_ALIASES: Record<string, string> = {
  cups: 'cup', c: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp', tbsps: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
  ounce: 'oz', ounces: 'oz', pound: 'lb', pounds: 'lb', lbs: 'lb',
  gram: 'g', grams: 'g', kilogram: 'kg', kilograms: 'kg',
  cloves: 'clove', cans: 'can', pinches: 'pinch', slices: 'slice', sprigs: 'sprig', stalks: 'stalk',
  units: 'unit', count: 'unit', whole: 'unit', '': 'unit',
};
const normUnit = (u: string) => {
  const k = String(u || '').toLowerCase().trim().replace(/\.$/, '');
  return UNIT_ALIASES[k] ?? k;
};

/**
 * Add what the meals need to one grocery list (one shopping trip), scaled to
 * servings, minus what the pantry already covers. Staples are skipped.
 * Returns how many list rows were added or topped up.
 */
async function addMealsToGrocery(
  client: import('pg').PoolClient, householdId: number, meals: PlanMeal[], week: string
): Promise<number> {
  const recipeIds = Array.from(new Set(meals.map((m) => m.recipe_id)));
  const ingRes = await client.query(
    `SELECT ri.recipe_id, ri.ingredient_id, COALESCE(ri.quantity, 0) AS quantity, COALESCE(ri.unit, 'unit') AS unit, r.servings
     FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id
     WHERE ri.recipe_id = ANY($1) AND r.household_id = $2`,
    [recipeIds, householdId]
  );
  const needed = new Map<string, { ingredientId: number; unit: string; quantity: number }>();
  for (const m of meals) {
    for (const ing of ingRes.rows.filter((r) => r.recipe_id === m.recipe_id)) {
      const scale = m.servings / Math.max(1, Number(ing.servings) || 1);
      const unit = normUnit(ing.unit);
      const key = `${ing.ingredient_id}|${unit}`;
      const entry = needed.get(key) ?? { ingredientId: ing.ingredient_id, unit, quantity: 0 };
      entry.quantity += Number(ing.quantity) * scale;
      needed.set(key, entry);
    }
  }

  const pantryRes = await client.query(
    'SELECT ingredient_id, quantity, unit, is_staple FROM pantry WHERE household_id = $1',
    [householdId]
  );
  const pantry = new Map(pantryRes.rows.map((p) => [p.ingredient_id, p]));

  let touched = 0;
  for (const item of Array.from(needed.values())) {
    const p = pantry.get(item.ingredientId);
    let qty = Math.round(item.quantity * 100) / 100;
    if (p?.is_staple) continue;
    if (p && Number(p.quantity) > 0) {
      // Same unit: buy only the shortfall. Different unit: can't compare, so trust the pantry.
      if (normUnit(p.unit) !== item.unit) continue;
      qty = Math.max(0, qty - Number(p.quantity));
      if (qty <= 0) continue;
    }

    const existing = await client.query(
      `SELECT id FROM grocery_list WHERE household_id = $1 AND week_start_date = $2 AND ingredient_id = $3 AND COALESCE(unit, 'unit') = $4`,
      [householdId, week, item.ingredientId, item.unit]
    );
    if (existing.rows.length) {
      await client.query('UPDATE grocery_list SET quantity = COALESCE(quantity, 0) + $1 WHERE id = $2', [qty, existing.rows[0].id]);
    } else {
      await client.query(
        `INSERT INTO grocery_list (household_id, ingredient_id, quantity, unit, estimated_price, week_start_date, is_purchased)
         VALUES ($1, $2, $3, $4, 0, $5, false)`,
        [householdId, item.ingredientId, qty || null, item.unit, week]
      );
    }
    touched++;
  }
  return touched;
}

export default router;
