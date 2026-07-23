// One-shot backfill: categorize every recipe with a NULL category using the
// same recipeCategorizer service the import path now uses.
// Run from server/: npx ts-node backfill-categories.ts
import * as dotenv from 'dotenv';
dotenv.config();

import pool from './src/config/database';
import { categorizeRecipe } from './src/services/recipeCategorizer';

(async () => {
  const { rows } = await pool.query(
    `SELECT id, name, description FROM recipes WHERE category IS NULL ORDER BY id`
  );
  console.log(`Backfilling categories for ${rows.length} recipes...\n`);

  const tally: Record<string, number> = {};
  for (const r of rows) {
    const category = await categorizeRecipe(r.name, r.description || undefined);
    await pool.query('UPDATE recipes SET category = $1 WHERE id = $2', [category, r.id]);
    tally[category] = (tally[category] || 0) + 1;
  }

  console.log('\n=== Backfill complete ===');
  for (const [cat, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${cat}`);
  }
  await pool.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
