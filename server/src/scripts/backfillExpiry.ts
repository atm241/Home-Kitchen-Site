// Fills in expiration dates for pantry items that don't have one, using the
// same shelf-life lookup the API uses (so the rules never drift apart).
//
// Usage: npm run backfill-expiry -- --dry-run     preview only
//        npm run backfill-expiry                  apply, dated from today
//        npm run backfill-expiry -- --from-added  date from when the item was
//                                                 added (marks old stock expired)
import * as dotenv from 'dotenv';
dotenv.config();

import pool from '../config/database';
import { getShelfLifeDays } from '../services/shelfLife';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fromAdded = process.argv.includes('--from-added');

  const items = (await pool.query(`
    SELECT p.id, p.last_updated, i.name, i.category
    FROM pantry p
    JOIN ingredients i ON p.ingredient_id = i.id
    WHERE p.expiration_date IS NULL
    ORDER BY i.name
  `)).rows;

  console.log(`Found ${items.length} pantry item(s) with no expiration date.`);
  console.log(
    `Dating from ${fromAdded ? "each item's last-updated date" : 'today'}.\n`
  );

  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const days = await getShelfLifeDays(item.name, item.category);

    if (days === null) {
      console.log(`  — ${item.name} (${item.category || 'no category'}): no shelf-life data, skipping`);
      skipped++;
      continue;
    }

    const base = fromAdded && item.last_updated ? new Date(item.last_updated) : new Date();
    const expiry = new Date(base);
    expiry.setDate(expiry.getDate() + days);
    const expiryStr = expiry.toISOString().split('T')[0];
    const expired = expiry < new Date() ? '  ⚠️  already past' : '';

    console.log(`  ✓ ${item.name.padEnd(28)} +${String(days).padStart(4)}d → ${expiryStr}${expired}`);
    if (!dryRun) {
      await pool.query('UPDATE pantry SET expiration_date = $1 WHERE id = $2', [expiryStr, item.id]);
    }
    updated++;
  }

  console.log(
    `\n${dryRun ? '[dry run] Would update' : 'Updated'} ${updated} item(s); ${skipped} skipped.`
  );
  if (dryRun) console.log('Re-run without --dry-run to apply.');

  await pool.end();
}

main().catch(err => {
  console.error('❌ Backfill failed:', err.message);
  process.exit(1);
});
