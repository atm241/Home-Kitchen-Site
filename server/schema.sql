-- Database schema for Home Kitchen Site
-- This file is the source of truth for a FRESH install (docker-compose init, or `npm run init-db`).
-- Existing databases should apply the files in server/migrations/ in order instead of re-running this.

-- Users & households (multi-tenant foundation)
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
    import_key_hash VARCHAR(64), -- SHA-256 of the phone Shortcut key
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_household ON users(household_id);

-- Recipes table
CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_url TEXT,
    category VARCHAR(100),
    servings INTEGER NOT NULL DEFAULT 1,
    prep_time INTEGER, -- in minutes
    cook_time INTEGER, -- in minutes
    instructions TEXT,
    calories INTEGER,
    protein DECIMAL(10, 2),
    carbs DECIMAL(10, 2),
    fat DECIMAL(10, 2),
    fiber DECIMAL(10, 2),
    image_url TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    dietary_tags TEXT[] DEFAULT '{}',
    difficulty TEXT DEFAULT 'medium',
    personal_notes TEXT,
    source_platform VARCHAR(20), -- tiktok | youtube | instagram | web
    source_author VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ingredients table (each household has its own catalog)
CREATE TABLE IF NOT EXISTS ingredients (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100), -- e.g., 'protein', 'vegetable', 'grain', 'spice', etc.
    barcode VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(household_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ingredients_barcode ON ingredients(barcode);

-- Recipe ingredients (junction table)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id SERIAL PRIMARY KEY,
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 2),
    unit VARCHAR(50), -- e.g., 'cup', 'tbsp', 'oz', 'piece', etc.
    notes TEXT -- e.g., 'chopped', 'diced', 'to taste'
);

-- Pantry items (what you currently have)
CREATE TABLE IF NOT EXISTS pantry (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 2),
    unit VARCHAR(50),
    expiration_date DATE,
    is_staple BOOLEAN DEFAULT FALSE, -- for items like olive oil, butter, spices
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(household_id, ingredient_id)
);

-- Grocery store prices
CREATE TABLE IF NOT EXISTS grocery_prices (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
    store_name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity DECIMAL(10, 2),
    unit VARCHAR(50),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(household_id, ingredient_id, store_name)
);

-- Scheduled meals (calendar events)
CREATE TABLE IF NOT EXISTS scheduled_meals (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
    meal_date DATE NOT NULL,
    meal_type VARCHAR(50), -- e.g., 'breakfast', 'lunch', 'dinner', 'snack'
    servings INTEGER NOT NULL DEFAULT 1,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_pattern VARCHAR(100), -- e.g., 'weekly', 'daily', comma-separated days
    recurrence_end_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Non-meal calendar events (like dinner reservations)
CREATE TABLE IF NOT EXISTS calendar_events (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    event_date DATE NOT NULL,
    event_type VARCHAR(50), -- e.g., 'reservation', 'event', 'other'
    meal_type VARCHAR(50), -- which meal this replaces, if any
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Grocery list items
CREATE TABLE IF NOT EXISTS grocery_list (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 2),
    unit VARCHAR(50),
    estimated_price DECIMAL(10, 2),
    is_purchased BOOLEAN DEFAULT FALSE,
    week_start_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Budget tracking (weekly)
CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    budget_amount DECIMAL(10, 2) NOT NULL,
    estimated_cost DECIMAL(10, 2) DEFAULT 0,
    actual_cost DECIMAL(10, 2) DEFAULT 0,
    calorie_budget INTEGER DEFAULT 2000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(household_id, week_start_date)
);

-- Budget tracking (monthly, calendar view)
CREATE TABLE IF NOT EXISTS monthly_budgets (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL, -- YYYY-MM format
    budget_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    calorie_budget INTEGER,
    protein_goal INTEGER,
    carbs_goal INTEGER,
    fat_goal INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(household_id, month)
);

-- Auto meal planner goals (last used, to prefill the form)
CREATE TABLE IF NOT EXISTS meal_plan_preferences (
    household_id INTEGER PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
    period_days INTEGER NOT NULL DEFAULT 7,
    budget_amount DECIMAL(10, 2),
    budget_start_date DATE,
    daily_calories INTEGER,
    protein_goal INTEGER,
    fiber_goal INTEGER,
    carbs_limit INTEGER,
    fat_limit INTEGER,
    meal_slots TEXT[] NOT NULL DEFAULT '{breakfast,lunch,dinner}',
    servings INTEGER NOT NULL DEFAULT 2,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Receipt totals (one per shopping trip), counted against the budget
CREATE TABLE IF NOT EXISTS grocery_receipts (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
    store_name VARCHAR(100),
    purchased_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_grocery_receipts_household_date ON grocery_receipts(household_id, purchased_on);

-- Meal portions consumed (for tracking servings and leftovers)
CREATE TABLE IF NOT EXISTS meal_portions (
    id SERIAL PRIMARY KEY,
    scheduled_meal_id INTEGER REFERENCES scheduled_meals(id) ON DELETE CASCADE,
    servings_made INTEGER NOT NULL,
    servings_consumed INTEGER DEFAULT 0,
    date_made DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cook history (log of meals actually cooked)
CREATE TABLE IF NOT EXISTS cook_history (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
    recipe_name TEXT NOT NULL,
    servings_cooked NUMERIC,
    cooked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Cached AI-generated ingredient combo suggestions (per pantry signature)
CREATE TABLE IF NOT EXISTS cached_ingredient_combos (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    pantry_signature TEXT NOT NULL,
    combos JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

-- Cached recipe recommendations (per pantry signature)
CREATE TABLE IF NOT EXISTS cached_recipe_recommendations (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    pantry_signature TEXT NOT NULL,
    recommendations JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_recipes_household ON recipes(household_id);
CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);
CREATE INDEX IF NOT EXISTS idx_ingredients_household ON ingredients(household_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name);
CREATE INDEX IF NOT EXISTS idx_pantry_household ON pantry(household_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_meals_household ON scheduled_meals(household_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_meals_date ON scheduled_meals(meal_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_household ON calendar_events(household_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_grocery_list_household ON grocery_list(household_id);
CREATE INDEX IF NOT EXISTS idx_grocery_list_week ON grocery_list(week_start_date);
CREATE INDEX IF NOT EXISTS idx_budgets_household ON budgets(household_id);
CREATE INDEX IF NOT EXISTS idx_budgets_week ON budgets(week_start_date);
CREATE INDEX IF NOT EXISTS idx_monthly_budgets_household ON monthly_budgets(household_id);
CREATE INDEX IF NOT EXISTS idx_cook_history_household ON cook_history(household_id);
CREATE INDEX IF NOT EXISTS idx_cached_combos_household_signature ON cached_ingredient_combos(household_id, pantry_signature);
CREATE INDEX IF NOT EXISTS idx_cached_combos_expires ON cached_ingredient_combos(expires_at);
CREATE INDEX IF NOT EXISTS idx_cached_recipes_household_signature ON cached_recipe_recommendations(household_id, pantry_signature);
CREATE INDEX IF NOT EXISTS idx_cached_recipes_expires ON cached_recipe_recommendations(expires_at);

-- ---------------------------------------------------------------------------
-- Migration bookkeeping
--
-- This file is the source of truth for a FRESH database; files in migrations/
-- upgrade an EXISTING one. The rows below mark the upgrade-only migrations as
-- already satisfied, so `npm run migrate` on a brand-new database skips them
-- (003 in particular fails against a fresh schema — its constraints exist here
-- already) and applies only the ones that still have work to do, such as the
-- shelf_life reference data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (filename) VALUES
  ('001_add_missing_columns.sql'),
  ('002_add_monthly_budgets.sql'),
  ('003_add_auth_and_households.sql')
ON CONFLICT (filename) DO NOTHING;

-- Video imports & phone share keys (mirrors migrations/008_video_imports.sql)
CREATE INDEX IF NOT EXISTS idx_recipes_household_source_url ON recipes(household_id, source_url);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_import_key_hash ON users(import_key_hash) WHERE import_key_hash IS NOT NULL;
