-- Index the foreign keys that didn't have one.
--
-- Postgres indexes primary keys automatically but never the referencing side of
-- a foreign key. Every one of these columns is used as a join key on a hot path
-- — loading a recipe's ingredients, checking what's in the pantry, building the
-- grocery list — and each is also scanned on DELETE to enforce the constraint.
--
-- At today's size (1,243 recipe_ingredients rows) a sequential scan is already
-- fast and these change nothing measurable. They're here so the queries keep
-- their shape as the data grows, rather than degrading quietly years from now.
--
-- Plain CREATE INDEX, not CONCURRENTLY: the migration runner wraps each file in
-- a transaction and CONCURRENTLY cannot run inside one. These tables are small
-- enough that the brief lock is irrelevant.
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients (recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient ON recipe_ingredients (ingredient_id);
CREATE INDEX IF NOT EXISTS idx_pantry_ingredient ON pantry (ingredient_id);
CREATE INDEX IF NOT EXISTS idx_grocery_list_ingredient ON grocery_list (ingredient_id);
CREATE INDEX IF NOT EXISTS idx_grocery_prices_ingredient ON grocery_prices (ingredient_id);
CREATE INDEX IF NOT EXISTS idx_cook_history_recipe ON cook_history (recipe_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_meals_recipe ON scheduled_meals (recipe_id);
CREATE INDEX IF NOT EXISTS idx_meal_portions_scheduled_meal ON meal_portions (scheduled_meal_id);
