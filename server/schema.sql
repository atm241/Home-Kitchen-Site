-- Database schema for Home Kitchen Site

-- Recipes table
CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ingredients table
CREATE TABLE IF NOT EXISTS ingredients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100), -- e.g., 'protein', 'vegetable', 'grain', 'spice', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 2),
    unit VARCHAR(50),
    expiration_date DATE,
    is_staple BOOLEAN DEFAULT FALSE, -- for items like olive oil, butter, spices
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ingredient_id)
);

-- Grocery store prices
CREATE TABLE IF NOT EXISTS grocery_prices (
    id SERIAL PRIMARY KEY,
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
    store_name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity DECIMAL(10, 2),
    unit VARCHAR(50),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ingredient_id, store_name)
);

-- Scheduled meals (calendar events)
CREATE TABLE IF NOT EXISTS scheduled_meals (
    id SERIAL PRIMARY KEY,
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
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 2),
    unit VARCHAR(50),
    estimated_price DECIMAL(10, 2),
    is_purchased BOOLEAN DEFAULT FALSE,
    week_start_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Budget tracking
CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    week_start_date DATE NOT NULL UNIQUE,
    budget_amount DECIMAL(10, 2) NOT NULL,
    estimated_cost DECIMAL(10, 2) DEFAULT 0,
    actual_cost DECIMAL(10, 2) DEFAULT 0,
    calorie_budget INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);
CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name);
CREATE INDEX IF NOT EXISTS idx_scheduled_meals_date ON scheduled_meals(meal_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_grocery_list_week ON grocery_list(week_start_date);
CREATE INDEX IF NOT EXISTS idx_budgets_week ON budgets(week_start_date);
