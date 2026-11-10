-- Macro-goal columns on monthly_budgets. These were added to schema.sql with
-- the meal planner, but databases initialized before that (schema.sql only
-- runs at first creation) never got them, and the planner INSERT fails
-- without them. IF NOT EXISTS makes this a no-op on newer databases.
ALTER TABLE monthly_budgets ADD COLUMN IF NOT EXISTS protein_goal INTEGER;
ALTER TABLE monthly_budgets ADD COLUMN IF NOT EXISTS carbs_goal INTEGER;
ALTER TABLE monthly_budgets ADD COLUMN IF NOT EXISTS fat_goal INTEGER;
