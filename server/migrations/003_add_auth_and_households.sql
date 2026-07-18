-- Migration 003: Multi-tenant foundation (users + households) and schema drift fixes.
-- Safe to run against an existing single-tenant database — all existing data is
-- backfilled into one "default" household so nothing is lost on upgrade.
-- Run this against an existing database that predates schema.sql's household_id columns.

-- 1. Bring in any tables that were previously created ad-hoc / via untracked ALTERs
--    (cook_history, cached_ingredient_combos, cached_recipe_recommendations, monthly_budgets)
--    so this migration works even on databases where those never went through a tracked migration.
CREATE TABLE IF NOT EXISTS cook_history (
    id SERIAL PRIMARY KEY,
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
    recipe_name TEXT NOT NULL,
    servings_cooked NUMERIC,
    cooked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_ingredient_combos (
    id SERIAL PRIMARY KEY,
    pantry_signature TEXT NOT NULL,
    combos JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS cached_recipe_recommendations (
    id SERIAL PRIMARY KEY,
    pantry_signature TEXT NOT NULL,
    recommendations JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS monthly_budgets (
    id SERIAL PRIMARY KEY,
    month VARCHAR(7) UNIQUE NOT NULL,
    budget_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    calorie_budget INTEGER,
    protein_goal INTEGER,
    carbs_goal INTEGER,
    fat_goal INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS dietary_tags TEXT[] DEFAULT '{}';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'medium';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS personal_notes TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS barcode VARCHAR(64);

-- 2. Households + users
CREATE TABLE IF NOT EXISTS households (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    invite_code VARCHAR(12) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_household ON users(household_id);

-- 3. Create a default household to own all pre-existing data, if any data exists
--    and no household has been created yet.
DO $$
DECLARE
  default_household_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM households) THEN
    INSERT INTO households (name, invite_code)
    VALUES ('My Household', substr(md5(random()::text), 1, 8))
    RETURNING id INTO default_household_id;
  ELSE
    SELECT id INTO default_household_id FROM households ORDER BY id LIMIT 1;
  END IF;

  -- 4. Add household_id to every household-scoped table, backfilled to the default household.
  ALTER TABLE recipes ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE recipes SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE recipes ALTER COLUMN household_id SET NOT NULL;

  ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE ingredients SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE ingredients ALTER COLUMN household_id SET NOT NULL;

  ALTER TABLE pantry ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE pantry SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE pantry ALTER COLUMN household_id SET NOT NULL;

  ALTER TABLE grocery_prices ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE grocery_prices SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE grocery_prices ALTER COLUMN household_id SET NOT NULL;

  ALTER TABLE scheduled_meals ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE scheduled_meals SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE scheduled_meals ALTER COLUMN household_id SET NOT NULL;

  ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE calendar_events SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE calendar_events ALTER COLUMN household_id SET NOT NULL;

  ALTER TABLE grocery_list ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE grocery_list SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE grocery_list ALTER COLUMN household_id SET NOT NULL;

  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE budgets SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE budgets ALTER COLUMN household_id SET NOT NULL;

  ALTER TABLE monthly_budgets ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE monthly_budgets SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE monthly_budgets ALTER COLUMN household_id SET NOT NULL;

  ALTER TABLE cook_history ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE cook_history SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE cook_history ALTER COLUMN household_id SET NOT NULL;

  ALTER TABLE cached_ingredient_combos ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE cached_ingredient_combos SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE cached_ingredient_combos ALTER COLUMN household_id SET NOT NULL;

  ALTER TABLE cached_recipe_recommendations ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
  UPDATE cached_recipe_recommendations SET household_id = default_household_id WHERE household_id IS NULL;
  ALTER TABLE cached_recipe_recommendations ALTER COLUMN household_id SET NOT NULL;
END $$;

-- 5. Re-scope unique constraints from global to per-household.
ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_name_key;
ALTER TABLE ingredients ADD CONSTRAINT ingredients_household_id_name_key UNIQUE (household_id, name);

ALTER TABLE pantry DROP CONSTRAINT IF EXISTS pantry_ingredient_id_key;
ALTER TABLE pantry ADD CONSTRAINT pantry_household_id_ingredient_id_key UNIQUE (household_id, ingredient_id);

ALTER TABLE grocery_prices DROP CONSTRAINT IF EXISTS grocery_prices_ingredient_id_store_name_key;
ALTER TABLE grocery_prices ADD CONSTRAINT grocery_prices_household_ingredient_store_key UNIQUE (household_id, ingredient_id, store_name);

ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_week_start_date_key;
ALTER TABLE budgets ADD CONSTRAINT budgets_household_week_key UNIQUE (household_id, week_start_date);

ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_month_key;
ALTER TABLE monthly_budgets ADD CONSTRAINT monthly_budgets_household_month_key UNIQUE (household_id, month);

-- 6. New indexes for household-scoped lookups
CREATE INDEX IF NOT EXISTS idx_recipes_household ON recipes(household_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_household ON ingredients(household_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_barcode ON ingredients(barcode);
CREATE INDEX IF NOT EXISTS idx_pantry_household ON pantry(household_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_meals_household ON scheduled_meals(household_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_household ON calendar_events(household_id);
CREATE INDEX IF NOT EXISTS idx_grocery_list_household ON grocery_list(household_id);
CREATE INDEX IF NOT EXISTS idx_budgets_household ON budgets(household_id);
CREATE INDEX IF NOT EXISTS idx_monthly_budgets_household ON monthly_budgets(household_id);
CREATE INDEX IF NOT EXISTS idx_cook_history_household ON cook_history(household_id);
CREATE INDEX IF NOT EXISTS idx_cached_combos_household_signature ON cached_ingredient_combos(household_id, pantry_signature);
CREATE INDEX IF NOT EXISTS idx_cached_recipes_household_signature ON cached_recipe_recommendations(household_id, pantry_signature);
