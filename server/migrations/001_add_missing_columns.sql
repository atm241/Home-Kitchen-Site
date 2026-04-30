-- Migration 001: Add missing columns and fix constraints
-- Run this against an existing database that was created from the original schema.sql

-- Add category column to recipes (was missing from schema but used in code)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Add calorie_budget column to budgets (was missing from schema but used in code)
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS calorie_budget INTEGER;

-- Drop the overly strict unique constraint on recipe_ingredients.
-- A recipe legitimately uses the same ingredient in multiple ways
-- (e.g., "2 cups flour for batter" + "1 tbsp flour for dusting").
ALTER TABLE recipe_ingredients
    DROP CONSTRAINT IF EXISTS recipe_ingredients_recipe_id_ingredient_id_key;
