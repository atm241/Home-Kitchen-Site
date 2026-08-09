-- Additions to the shelf-life reference: foods that were falling through to a
-- misleading default. Broths and stocks were inheriting raw chicken's 2 days;
-- frozen vegetables were inheriting fresh produce's 7.

INSERT INTO shelf_life (keyword, category, days) VALUES
-- Broths and stocks — unopened carton/can pantry life
('chicken stock', 'Canned Goods', 365),
('chicken broth', 'Canned Goods', 365),
('beef stock', 'Canned Goods', 365),
('beef broth', 'Canned Goods', 365),
('vegetable stock', 'Canned Goods', 365),
('vegetable broth', 'Canned Goods', 365),
('stock', 'Canned Goods', 365),
('broth', 'Canned Goods', 365),

-- Frozen goods keep far longer than their fresh counterparts
('frozen', 'Produce', 240),
('frozen', 'Proteins', 240),

-- Shelf-stable sweeteners that effectively don't spoil
('honey', 'Condiments & Sauces', 1825),
('maple syrup', 'Condiments & Sauces', 365),
('jam', 'Condiments & Sauces', 365),
('peanut butter', 'Condiments & Sauces', 180)
ON CONFLICT (keyword, category) DO UPDATE SET days = EXCLUDED.days;
