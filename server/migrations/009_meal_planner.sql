-- Auto meal planner goals, plus receipt totals for budget tracking.

-- What the household asked the planner for last time, so the form is
-- prefilled. budget_amount is optional and covers period_days, starting
-- from budget_start_date.
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

-- One row per shopping trip: just the receipt total, read from a scan or
-- typed in. Spending against the budget is the sum of these.
CREATE TABLE IF NOT EXISTS grocery_receipts (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
    store_name VARCHAR(100),
    purchased_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_grocery_receipts_household_date
    ON grocery_receipts(household_id, purchased_on);
