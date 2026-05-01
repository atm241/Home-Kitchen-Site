-- Migration 002: Add monthly_budgets table for calendar-level budget tracking
CREATE TABLE IF NOT EXISTS monthly_budgets (
  id SERIAL PRIMARY KEY,
  month VARCHAR(7) UNIQUE NOT NULL, -- YYYY-MM format
  budget_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  calorie_budget INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
