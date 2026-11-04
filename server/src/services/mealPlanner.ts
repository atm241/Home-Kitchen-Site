import pool from '../config/database';

// Auto meal planner: fills breakfast/lunch/dinner slots for a date range from
// the household's own cookbook, aiming at daily calorie and nutrient goals.
//
// There is no price data per recipe (spending comes from receipt totals), so
// "budget-friendly" here means a shorter shopping list: reuse ingredients
// across meals and lean on what's already in the pantry.

export type Slot = 'breakfast' | 'lunch' | 'dinner';
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner'];

export interface PlannerGoals {
  start_date: string;
  period_days: number;
  daily_calories: number | null;
  protein_goal: number | null;
  fiber_goal: number | null;
  carbs_limit: number | null;
  fat_limit: number | null;
  meal_slots: Slot[];
  servings: number;
  budget_amount: number | null;
}

export interface PlanMeal {
  date: string;
  slot: Slot;
  recipe_id: number;
  servings: number;
  pinned?: boolean;       // chosen by the person; keep it on regenerate
  existing_id?: number;   // already on the calendar; never changed here
}

interface RecipeInfo {
  id: number;
  name: string;
  category: string | null;
  servings: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  image_url: string | null;
  is_favorite: boolean;
  total_time: number | null;
  ingredients: string[];   // normalized names
  pantryShare: number;     // 0..1 of ingredients already on hand
}

export interface PlannerContext {
  recipes: Map<number, RecipeInfo>;
  onHand: Set<string>;
  recentlyCooked: Set<number>;
  existing: PlanMeal[];
}

// How well a recipe category suits each meal. 0 / missing = never offered.
const AFFINITY: Record<Slot, Record<string, number>> = {
  breakfast: { Breakfast: 1 },
  lunch: { Lunch: 1, Salads: 0.9, 'Soups & Stews': 0.9, Dinner: 0.7, __none: 0.5 },
  dinner: { Dinner: 1, 'Soups & Stews': 0.85, Lunch: 0.6, Salads: 0.5, __none: 0.6 },
};

// Share of the day's calories each meal should carry. Not renormalized when
// a meal is skipped: planning only dinners shouldn't mean a 2,000-cal dinner.
const CALORIE_SHARE: Record<Slot, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.4 };

export const affinity = (recipe: RecipeInfo, slot: Slot) =>
  AFFINITY[slot][recipe.category ?? '__none'] ?? 0;

const norm = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();

// ---------- Dates (plain YYYY-MM-DD strings, no time zones) ----------

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return addDays(date, -d.getUTCDay()); // weeks start on Sunday, like the client
}

export const planDates = (goals: PlannerGoals) =>
  Array.from({ length: goals.period_days }, (_, i) => addDays(goals.start_date, i));

// ---------- Loading ----------

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function loadContext(householdId: number, from: string, to: string): Promise<PlannerContext> {
  const [recipesRes, ingRes, pantryRes, historyRes, mealsRes] = await Promise.all([
    pool.query(
      `SELECT id, name, category, servings, calories, protein, carbs, fat, fiber, image_url,
              is_favorite, COALESCE(prep_time, 0) + COALESCE(cook_time, 0) AS total_time
       FROM recipes WHERE household_id = $1`,
      [householdId]
    ),
    pool.query(
      `SELECT ri.recipe_id, i.name FROM recipe_ingredients ri
       JOIN ingredients i ON i.id = ri.ingredient_id
       JOIN recipes r ON r.id = ri.recipe_id
       WHERE r.household_id = $1`,
      [householdId]
    ),
    pool.query(
      `SELECT i.name FROM pantry p JOIN ingredients i ON i.id = p.ingredient_id
       WHERE p.household_id = $1 AND (p.is_staple OR COALESCE(p.quantity, 1) > 0)`,
      [householdId]
    ),
    pool.query(
      `SELECT DISTINCT recipe_id FROM cook_history
       WHERE household_id = $1 AND recipe_id IS NOT NULL AND cooked_at >= CURRENT_DATE - 7`,
      [householdId]
    ).catch(() => ({ rows: [] as Array<{ recipe_id: number }> })),
    pool.query(
      `SELECT id, recipe_id, to_char(meal_date, 'YYYY-MM-DD') AS date, LOWER(meal_type) AS slot, servings
       FROM scheduled_meals
       WHERE household_id = $1 AND meal_date BETWEEN $2 AND $3 AND recipe_id IS NOT NULL`,
      [householdId, from, to]
    ),
  ]);

  const onHand = new Set<string>(pantryRes.rows.map((r) => norm(r.name)));
  const ingredientsByRecipe = new Map<number, string[]>();
  for (const row of ingRes.rows) {
    const list = ingredientsByRecipe.get(row.recipe_id) ?? [];
    const n = norm(row.name);
    if (!list.includes(n)) list.push(n);
    ingredientsByRecipe.set(row.recipe_id, list);
  }

  const recipes = new Map<number, RecipeInfo>();
  for (const r of recipesRes.rows) {
    const ingredients = ingredientsByRecipe.get(r.id) ?? [];
    recipes.set(r.id, {
      id: r.id,
      name: r.name,
      category: r.category,
      servings: Math.max(1, Number(r.servings) || 1),
      calories: num(r.calories),
      protein: num(r.protein),
      carbs: num(r.carbs),
      fat: num(r.fat),
      fiber: num(r.fiber),
      image_url: r.image_url,
      is_favorite: !!r.is_favorite,
      total_time: Number(r.total_time) || null,
      ingredients,
      pantryShare: ingredients.length ? ingredients.filter((i) => onHand.has(i)).length / ingredients.length : 0,
    });
  }

  const existing: PlanMeal[] = mealsRes.rows.map((m) => ({
    date: m.date,
    slot: (SLOTS.includes(m.slot) ? m.slot : 'dinner') as Slot,
    recipe_id: m.recipe_id,
    servings: m.servings,
    existing_id: m.id,
  }));

  return {
    recipes,
    onHand,
    recentlyCooked: new Set(historyRes.rows.map((r) => r.recipe_id)),
    existing,
  };
}

// ---------- Scoring ----------

type Nutrient = 'protein' | 'fiber' | 'carbs' | 'fat';

/** Goals that enough recipes have data for. Others are ignored (with a warning). */
export function usableGoals(goals: PlannerGoals, ctx: PlannerContext) {
  const all = Array.from(ctx.recipes.values());
  const coverage = (key: Nutrient | 'calories') =>
    all.length ? all.filter((r) => r[key] !== null).length / all.length : 0;
  return {
    calories: goals.daily_calories && coverage('calories') >= 0.3 ? goals.daily_calories : null,
    protein: goals.protein_goal && coverage('protein') >= 0.3 ? goals.protein_goal : null,
    fiber: goals.fiber_goal && coverage('fiber') >= 0.3 ? goals.fiber_goal : null,
    carbs: goals.carbs_limit && coverage('carbs') >= 0.3 ? goals.carbs_limit : null,
    fat: goals.fat_limit && coverage('fat') >= 0.3 ? goals.fat_limit : null,
  };
}

type Usable = ReturnType<typeof usableGoals>;

export interface DayTotals {
  date: string;
  calories: number;
  protein: number;
  fiber: number;
  carbs: number;
  fat: number;
  unknown: number; // meals without calorie info
  target: number | null;
}

/** Per-person totals for each day, counting meals without data as on-target for their slot. */
export function dayTotals(meals: PlanMeal[], goals: PlannerGoals, ctx: PlannerContext, usable: Usable): DayTotals[] {
  const byDate = new Map<string, DayTotals>();
  for (const date of planDates(goals)) {
    const shares = goals.meal_slots.reduce((s, slot) => s + CALORIE_SHARE[slot], 0);
    byDate.set(date, {
      date, calories: 0, protein: 0, fiber: 0, carbs: 0, fat: 0, unknown: 0,
      target: usable.calories ? Math.round(usable.calories * shares) : null,
    });
  }
  for (const meal of meals) {
    const day = byDate.get(meal.date);
    const r = ctx.recipes.get(meal.recipe_id);
    if (!day || !r) continue;
    const share = CALORIE_SHARE[meal.slot] ?? 0.3;
    if (r.calories === null) {
      day.unknown++;
      if (usable.calories) day.calories += usable.calories * share;
    } else {
      day.calories += r.calories;
    }
    // Missing nutrient data counts as exactly meeting that meal's share.
    day.protein += r.protein ?? (usable.protein ?? 0) * share;
    day.fiber += r.fiber ?? (usable.fiber ?? 0) * share;
    day.carbs += r.carbs ?? (usable.carbs ?? 0) * share;
    day.fat += r.fat ?? (usable.fat ?? 0) * share;
  }
  return Array.from(byDate.values());
}

/** Distinct ingredients to buy, counted per 7-day block (you'd shop again after a week). */
export function itemsToBuy(meals: PlanMeal[], goals: PlannerGoals, ctx: PlannerContext): number {
  const blocks = new Map<number, Set<string>>();
  for (const meal of meals) {
    if (meal.existing_id) continue;
    const r = ctx.recipes.get(meal.recipe_id);
    if (!r) continue;
    const block = Math.floor(daysBetween(goals.start_date, meal.date) / 7);
    const set = blocks.get(block) ?? new Set<string>();
    for (const ing of r.ingredients) if (!ctx.onHand.has(ing)) set.add(ing);
    blocks.set(block, set);
  }
  let total = 0;
  blocks.forEach((s) => { total += s.size; });
  return total;
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Lower is better. */
export function score(meals: PlanMeal[], goals: PlannerGoals, ctx: PlannerContext, usable: Usable): number {
  let penalty = 0;
  const plannedDates = new Set(meals.map((m) => m.date));

  for (const day of dayTotals(meals, goals, ctx, usable)) {
    if (!plannedDates.has(day.date)) continue;
    if (day.target) penalty += 2.0 * Math.abs(day.calories - day.target) / day.target;
    const shares = goals.meal_slots.reduce((s, slot) => s + CALORIE_SHARE[slot], 0);
    if (usable.protein) penalty += 1.5 * Math.max(0, usable.protein * shares - day.protein) / (usable.protein * shares);
    if (usable.fiber) penalty += 1.0 * Math.max(0, usable.fiber * shares - day.fiber) / (usable.fiber * shares);
    if (usable.carbs) penalty += 1.0 * Math.max(0, day.carbs - usable.carbs * shares) / (usable.carbs * shares);
    if (usable.fat) penalty += 1.0 * Math.max(0, day.fat - usable.fat * shares) / (usable.fat * shares);
  }

  // Per-meal fit
  const uses = new Map<number, PlanMeal[]>();
  for (const meal of meals) {
    const r = ctx.recipes.get(meal.recipe_id);
    if (!r) continue;
    if (!meal.existing_id) {
      penalty += (1 - affinity(r, meal.slot)) * 0.6;
      if (usable.calories && r.calories === null) penalty += 0.15;
      if (r.is_favorite) penalty -= 0.08;
      penalty -= 0.25 * r.pantryShare;
      if (ctx.recentlyCooked.has(r.id)) penalty += 0.1;
    }
    const list = uses.get(r.id) ?? [];
    list.push(meal);
    uses.set(r.id, list);
  }

  // Variety. Dinner followed by the same thing for next day's lunch is
  // leftovers, which is a feature, so that pair doesn't count as a repeat.
  uses.forEach((list) => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
    let repeats = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const gap = daysBetween(prev.date, cur.date);
      const leftovers = prev.slot === 'dinner' && cur.slot === 'lunch' && gap === 1;
      if (leftovers) continue;
      repeats++;
      if (gap <= 2) penalty += 0.4;
    }
    penalty += 0.35 * Math.pow(repeats, 1.3);
  });

  // Shorter shopping list. Weighs more when the person set a budget.
  penalty += (goals.budget_amount ? 0.04 : 0.015) * itemsToBuy(meals, goals, ctx);

  return penalty;
}

// ---------- Search ----------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function candidatesFor(slot: Slot, ctx: PlannerContext): RecipeInfo[] {
  return Array.from(ctx.recipes.values()).filter((r) => affinity(r, slot) > 0);
}

export interface GenerateResult {
  meals: PlanMeal[];
  warnings: string[];
}

export function generatePlan(
  goals: PlannerGoals,
  ctx: PlannerContext,
  opts: { pinned?: PlanMeal[]; keepExisting?: boolean; seed?: number } = {}
): GenerateResult {
  const usable = usableGoals(goals, ctx);
  const rng = mulberry32(opts.seed ?? Date.now());
  const warnings: string[] = [];

  const keepExisting = opts.keepExisting !== false;
  const existing = keepExisting ? ctx.existing : [];
  const taken = new Set(existing.map((m) => `${m.date}|${m.slot}`));

  const pinned = (opts.pinned ?? []).filter(
    (m) => ctx.recipes.has(m.recipe_id) && !taken.has(`${m.date}|${m.slot}`) && goals.meal_slots.includes(m.slot)
  ).map((m) => ({ ...m, pinned: true, servings: m.servings || goals.servings }));
  pinned.forEach((m) => taken.add(`${m.date}|${m.slot}`));

  const pools: Record<Slot, RecipeInfo[]> = {
    breakfast: candidatesFor('breakfast', ctx),
    lunch: candidatesFor('lunch', ctx),
    dinner: candidatesFor('dinner', ctx),
  };

  const free: Array<{ date: string; slot: Slot }> = [];
  for (const date of planDates(goals)) {
    for (const slot of SLOTS) {
      if (!goals.meal_slots.includes(slot) || taken.has(`${date}|${slot}`)) continue;
      if (pools[slot].length === 0) continue;
      free.push({ date, slot });
    }
  }

  const meals: PlanMeal[] = [...existing, ...pinned];
  const fixedCount = meals.length;

  // Greedy pass, with a little noise so "Regenerate" gives a different plan.
  for (const spot of free) {
    let best: RecipeInfo | null = null;
    let bestScore = Infinity;
    for (const r of pools[spot.slot]) {
      meals.push({ date: spot.date, slot: spot.slot, recipe_id: r.id, servings: goals.servings });
      const s = score(meals, goals, ctx, usable) + rng() * 0.15;
      meals.pop();
      if (s < bestScore) { bestScore = s; best = r; }
    }
    if (best) meals.push({ date: spot.date, slot: spot.slot, recipe_id: best.id, servings: goals.servings });
  }

  // Improvement passes: try every alternative in every free slot.
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    let current = score(meals, goals, ctx, usable);
    for (let i = fixedCount; i < meals.length; i++) {
      const original = meals[i];
      for (const r of pools[original.slot]) {
        if (r.id === meals[i].recipe_id) continue;
        const prev = meals[i];
        meals[i] = { ...original, recipe_id: r.id };
        const s = score(meals, goals, ctx, usable);
        if (s < current - 1e-6) { current = s; improved = true; } else { meals[i] = prev; }
      }
    }
    if (!improved) break;
  }

  // Warnings people can act on
  for (const slot of goals.meal_slots) {
    const n = pools[slot].length;
    if (n === 0) warnings.push(`No ${slot} recipes in your cookbook yet, so ${slot}s are left empty.`);
    else if (n < 4 && goals.period_days >= 7) warnings.push(`Only ${n} ${slot} recipe${n === 1 ? '' : 's'} in your cookbook, so they repeat. Save a few more to mix it up.`);
  }
  const labels: Record<string, string> = { calories: 'calorie', protein: 'protein', fiber: 'fiber', carbs: 'carb', fat: 'fat' };
  const asked: Record<string, number | null> = {
    calories: goals.daily_calories, protein: goals.protein_goal, fiber: goals.fiber_goal,
    carbs: goals.carbs_limit, fat: goals.fat_limit,
  };
  for (const key of Object.keys(asked)) {
    if (asked[key] && !(usable as Record<string, number | null>)[key]) {
      warnings.push(`Most of your recipes don't have ${labels[key]} info yet, so that goal isn't used.`);
    }
  }

  return { meals: sortMeals(meals), warnings };
}

export function sortMeals(meals: PlanMeal[]) {
  return [...meals].sort((a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
}

/** Best replacements for one slot, given the rest of the plan. */
export function alternatives(
  meals: PlanMeal[], target: { date: string; slot: Slot }, goals: PlannerGoals, ctx: PlannerContext, limit = 12
) {
  const usable = usableGoals(goals, ctx);
  const rest = meals.filter((m) => !(m.date === target.date && m.slot === target.slot));
  const scored = candidatesFor(target.slot, ctx).map((r) => ({
    recipe: r,
    score: score([...rest, { date: target.date, slot: target.slot, recipe_id: r.id, servings: goals.servings }], goals, ctx, usable),
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.recipe.id);
}

/** Summary numbers for the review screen. */
export function summarize(meals: PlanMeal[], goals: PlannerGoals, ctx: PlannerContext) {
  const usable = usableGoals(goals, ctx);
  const days = dayTotals(meals, goals, ctx, usable);
  const plannedDates = new Set(meals.map((m) => m.date));
  const plannedDays = days.filter((d) => plannedDates.has(d.date));
  const avg = (key: keyof Pick<DayTotals, 'calories' | 'protein' | 'fiber' | 'carbs' | 'fat'>) =>
    plannedDays.length ? Math.round(plannedDays.reduce((s, d) => s + d[key], 0) / plannedDays.length) : 0;
  return {
    days: days.map((d) => ({ ...d, calories: Math.round(d.calories), protein: Math.round(d.protein) })),
    avg_calories: avg('calories'),
    avg_protein: avg('protein'),
    avg_fiber: avg('fiber'),
    avg_carbs: avg('carbs'),
    avg_fat: avg('fat'),
    calorie_target: plannedDays[0]?.target ?? null,
    days_on_target: plannedDays.filter((d) => d.target && Math.abs(d.calories - d.target) / d.target <= 0.1).length,
    planned_days: plannedDays.length,
    items_to_buy: itemsToBuy(meals, goals, ctx),
    distinct_recipes: new Set(meals.map((m) => m.recipe_id)).size,
    used_goals: usable,
  };
}

export function recipeCard(r: RecipeInfo) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    image_url: r.image_url,
    calories: r.calories,
    protein: r.protein,
    fiber: r.fiber,
    total_time: r.total_time,
    is_favorite: r.is_favorite,
    pantry_share: Math.round(r.pantryShare * 100) / 100,
  };
}
