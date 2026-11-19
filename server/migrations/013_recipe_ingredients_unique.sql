-- Recipe saving and every import use
--   ON CONFLICT (recipe_id, ingredient_id)
-- to merge a repeated ingredient into one line, which needs a unique
-- constraint on that pair. schema.sql never declared it, so on any database
-- built from schema.sql every recipe with ingredients failed to save with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".

-- Merge any existing duplicates first (keep the oldest row, sum quantities),
-- or adding the constraint would fail.
UPDATE recipe_ingredients keep
SET quantity = sums.total
FROM (
    SELECT MIN(id) AS keep_id, SUM(quantity) AS total
    FROM recipe_ingredients
    GROUP BY recipe_id, ingredient_id
    HAVING COUNT(*) > 1
) sums
WHERE keep.id = sums.keep_id;

DELETE FROM recipe_ingredients dup
USING recipe_ingredients keep
WHERE dup.recipe_id = keep.recipe_id
  AND dup.ingredient_id = keep.ingredient_id
  AND dup.id > keep.id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'recipe_ingredients_recipe_id_ingredient_id_key'
    ) THEN
        ALTER TABLE recipe_ingredients
            ADD CONSTRAINT recipe_ingredients_recipe_id_ingredient_id_key UNIQUE (recipe_id, ingredient_id);
    END IF;
END $$;
