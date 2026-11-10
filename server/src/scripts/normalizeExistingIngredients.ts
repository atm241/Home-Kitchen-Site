// One-off cleanup of ingredient prose in already-imported recipes.
//
// Recipes imported before the normalizer shipped carry entries like
// "Half a cucumber, peeled, seeded and cut into 1/8-inch sticks" as the
// ingredient NAME. This walks every recipe, runs messy lists through the
// same normalizer new imports use, and rewrites recipe_ingredients
// (upserting clean ingredient rows; old ones are left for other references).
//
// Usage (inside the server container, where DATABASE_URL and the API key live):
//   node dist/scripts/normalizeExistingIngredients.js --dry-run   # print changes only
//   node dist/scripts/normalizeExistingIngredients.js             # apply
import pool from '../config/database';
import { normalizeIngredients, looksMessy, IngredientEntry } from '../services/ingredientNormalizer';
import { categorizeIngredient } from '../services/ingredientCategorizer';

const DRY_RUN = process.argv.includes('--dry-run');

interface Row {
  ri_id: number;
  ingredient_id: number;
  name: string;
  quantity: string | null;
  unit: string | null;
  notes: string | null;
}

async function main() {
  const recipes = await pool.query(
    'SELECT id, household_id, name FROM recipes ORDER BY id'
  );
  let recipesTouched = 0;
  let entriesCleaned = 0;

  for (const recipe of recipes.rows) {
    const rows = await pool.query<Row>(
      `SELECT ri.id AS ri_id, ri.ingredient_id, i.name, ri.quantity, ri.unit, ri.notes
       FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.recipe_id = $1 ORDER BY ri.id`,
      [recipe.id]
    );
    if (rows.rows.length === 0) continue;

    const entries: IngredientEntry[] = rows.rows.map((r) => ({
      name: r.name,
      quantity: r.quantity === null ? null : Number(r.quantity),
      unit: r.unit,
      notes: r.notes,
    }));
    if (!entries.some(looksMessy)) continue;

    const cleaned = await normalizeIngredients(entries);
    if (cleaned === entries) {
      console.log(`SKIP (cleanup unavailable): #${recipe.id} ${recipe.name}`);
      continue;
    }

    recipesTouched++;
    for (let i = 0; i < rows.rows.length; i++) {
      const before = entries[i];
      const after = cleaned[i];
      const changed =
        after.name !== before.name ||
        (after.quantity ?? null) !== (before.quantity ?? null) ||
        (after.unit ?? null) !== (before.unit ?? null) ||
        (after.notes ?? null) !== (before.notes ?? null);
      if (!changed) continue;
      entriesCleaned++;
      console.log(`#${recipe.id} ${recipe.name}`);
      console.log(`   - ${before.quantity ?? ''} ${before.unit ?? ''} | ${before.name} | ${before.notes ?? ''}`);
      console.log(`   + ${after.quantity ?? ''} ${after.unit ?? ''} | ${after.name} | ${after.notes ?? ''}`);
      if (DRY_RUN) continue;

      const ing = await pool.query(
        `INSERT INTO ingredients (household_id, name, category) VALUES ($1, $2, $3)
         ON CONFLICT (household_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [recipe.household_id, after.name, await categorizeIngredient(after.name)]
      );
      await pool.query(
        `UPDATE recipe_ingredients SET ingredient_id = $1, quantity = $2, unit = $3, notes = $4 WHERE id = $5`,
        [ing.rows[0].id, after.quantity ?? null, after.unit ?? null, after.notes ?? null, rows.rows[i].ri_id]
      );
    }
  }

  console.log(`\n${DRY_RUN ? '[dry run] Would clean' : 'Cleaned'} ${entriesCleaned} entries across ${recipesTouched} recipes.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
