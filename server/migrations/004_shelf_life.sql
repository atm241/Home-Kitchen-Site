-- Shelf-life reference data, based on the USDA/FDA FoodKeeper guidance.
-- Rows with a keyword match a specific food by name; rows with keyword NULL are
-- the fallback for their whole category. `days` counts from the purchase date
-- and assumes normal storage for that food (fridge for perishables, pantry for
-- shelf-stable goods) — we don't track storage location per item.

CREATE TABLE IF NOT EXISTS shelf_life (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(100),
  category VARCHAR(50) NOT NULL,
  days INTEGER NOT NULL CHECK (days > 0),
  UNIQUE (keyword, category)
);

CREATE INDEX IF NOT EXISTS idx_shelf_life_keyword ON shelf_life (keyword);

-- Re-seeding is safe: this file can be re-run to pick up reference updates.
DELETE FROM shelf_life;

INSERT INTO shelf_life (keyword, category, days) VALUES
-- ── Category fallbacks (keyword NULL) ──────────────────────────────────────
(NULL, 'Produce', 7),
(NULL, 'Proteins', 3),
(NULL, 'Dairy', 10),
(NULL, 'Beverages', 14),
(NULL, 'Grains & Pasta', 180),
(NULL, 'Canned Goods', 730),
(NULL, 'Spices & Seasonings', 730),
(NULL, 'Oils & Vinegars', 365),
(NULL, 'Baking', 365),
(NULL, 'Condiments & Sauces', 180),
(NULL, 'Snacks', 60),

-- ── Produce ───────────────────────────────────────────────────────────────
-- Highly perishable
('raspberries', 'Produce', 2),
('blackberries', 'Produce', 2),
('strawberries', 'Produce', 3),
('berries', 'Produce', 3),
('corn', 'Produce', 2),
('asparagus', 'Produce', 4),
('avocado', 'Produce', 4),
('spinach', 'Produce', 5),
('salad greens', 'Produce', 5),
('arugula', 'Produce', 5),
('bananas', 'Produce', 5),
('banana', 'Produce', 5),
('broccoli', 'Produce', 5),
('zucchini', 'Produce', 5),
('tomatoes', 'Produce', 5),
('tomato', 'Produce', 5),
('peaches', 'Produce', 5),
('plums', 'Produce', 5),
('pears', 'Produce', 5),
('mango', 'Produce', 5),
('melon', 'Produce', 5),
('cantaloupe', 'Produce', 5),
('pineapple', 'Produce', 5),
-- About a week
('lettuce', 'Produce', 7),
('cucumber', 'Produce', 7),
('cauliflower', 'Produce', 7),
('mushrooms', 'Produce', 7),
('green beans', 'Produce', 7),
('grapes', 'Produce', 7),
('blueberries', 'Produce', 10),
('herbs', 'Produce', 7),
('cilantro', 'Produce', 7),
('parsley', 'Produce', 7),
('basil', 'Produce', 7),
('dill', 'Produce', 7),
('mint', 'Produce', 7),
('scallions', 'Produce', 7),
('green onions', 'Produce', 7),
-- Two weeks plus
('bell pepper', 'Produce', 14),
('peppers', 'Produce', 14),
('celery', 'Produce', 14),
('carrots', 'Produce', 21),
('lemon', 'Produce', 21),
('lime', 'Produce', 21),
('orange', 'Produce', 21),
('ginger', 'Produce', 21),
('apples', 'Produce', 30),
('apple', 'Produce', 30),
('cabbage', 'Produce', 30),
('onions', 'Produce', 30),
('onion', 'Produce', 30),
('sweet potato', 'Produce', 30),
('squash', 'Produce', 30),
('potatoes', 'Produce', 60),
('potato', 'Produce', 60),
('garlic', 'Produce', 90),

-- ── Proteins ──────────────────────────────────────────────────────────────
('fish', 'Proteins', 2),
('salmon', 'Proteins', 2),
('tilapia', 'Proteins', 2),
('cod', 'Proteins', 2),
('tuna steak', 'Proteins', 2),
('shrimp', 'Proteins', 2),
('scallops', 'Proteins', 2),
('ground beef', 'Proteins', 2),
('ground turkey', 'Proteins', 2),
('ground pork', 'Proteins', 2),
('ground chicken', 'Proteins', 2),
('chicken', 'Proteins', 2),
('chicken breast', 'Proteins', 2),
('chicken thighs', 'Proteins', 2),
('turkey', 'Proteins', 2),
('sausage', 'Proteins', 2),
('beef', 'Proteins', 4),
('steak', 'Proteins', 4),
('pork', 'Proteins', 4),
('lamb', 'Proteins', 4),
('deli meat', 'Proteins', 5),
('tofu', 'Proteins', 5),
('bacon', 'Proteins', 7),
('ham', 'Proteins', 7),
('hot dogs', 'Proteins', 14),
('eggs', 'Proteins', 35),

-- ── Dairy ─────────────────────────────────────────────────────────────────
('milk', 'Dairy', 7),
('half and half', 'Dairy', 7),
('buttermilk', 'Dairy', 14),
('heavy cream', 'Dairy', 10),
('cottage cheese', 'Dairy', 10),
('ricotta', 'Dairy', 7),
('yogurt', 'Dairy', 14),
('greek yogurt', 'Dairy', 14),
('cream cheese', 'Dairy', 14),
('mozzarella', 'Dairy', 14),
('feta', 'Dairy', 14),
('shredded cheese', 'Dairy', 14),
('sour cream', 'Dairy', 21),
('butter', 'Dairy', 30),
('cheddar', 'Dairy', 42),
('parmesan', 'Dairy', 60),
('hard cheese', 'Dairy', 60),

-- ── Beverages ─────────────────────────────────────────────────────────────
('orange juice', 'Beverages', 7),
('juice', 'Beverages', 7),
('beer', 'Beverages', 120),
('soda', 'Beverages', 180),
('coffee', 'Beverages', 180),
('wine', 'Beverages', 365),
('tea', 'Beverages', 365),

-- ── Grains & Pasta ────────────────────────────────────────────────────────
('bread', 'Grains & Pasta', 7),
('bagels', 'Grains & Pasta', 7),
('tortillas', 'Grains & Pasta', 14),
('cereal', 'Grains & Pasta', 180),
('rice', 'Grains & Pasta', 365),
('quinoa', 'Grains & Pasta', 365),
('oats', 'Grains & Pasta', 365),
('pasta', 'Grains & Pasta', 730),

-- ── Baking ────────────────────────────────────────────────────────────────
('yeast', 'Baking', 120),
('baking powder', 'Baking', 180),
('flour', 'Baking', 240),
('brown sugar', 'Baking', 540),
('baking soda', 'Baking', 730),
('sugar', 'Baking', 730),

-- ── Condiments & Sauces ───────────────────────────────────────────────────
('salsa', 'Condiments & Sauces', 14),
('pesto', 'Condiments & Sauces', 7),
('mayonnaise', 'Condiments & Sauces', 60),
('ketchup', 'Condiments & Sauces', 180),
('barbecue sauce', 'Condiments & Sauces', 120),
('hot sauce', 'Condiments & Sauces', 365),
('mustard', 'Condiments & Sauces', 365),
('soy sauce', 'Condiments & Sauces', 730),

-- ── Oils & Vinegars ───────────────────────────────────────────────────────
('olive oil', 'Oils & Vinegars', 365),
('vegetable oil', 'Oils & Vinegars', 365),
('sesame oil', 'Oils & Vinegars', 365),
('vinegar', 'Oils & Vinegars', 1095);
