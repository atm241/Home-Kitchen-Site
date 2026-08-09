// Applies un-run SQL files from ./migrations in filename order, recording each
// in schema_migrations so it only ever runs once.
//
// Usage: npm run migrate
//        npm run migrate -- --status         list applied / pending
//        npm run migrate -- --baseline       mark all current files as applied
//                                            (for a DB that predates this runner)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
}

async function main() {
  const status = process.argv.includes('--status');
  const baseline = process.argv.includes('--baseline');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const applied = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map(r => r.filename)
    );
    const files = migrationFiles();
    const pending = files.filter(f => !applied.has(f));

    if (status) {
      for (const f of files) console.log(`${applied.has(f) ? '✓ applied' : '· pending'}  ${f}`);
      return;
    }

    if (baseline) {
      for (const f of pending) {
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
        console.log(`marked applied (not run): ${f}`);
      }
      console.log(`\n✅ Baselined ${pending.length} file(s)`);
      return;
    }

    if (pending.length === 0) {
      console.log('Up to date — no pending migrations.');
      return;
    }

    for (const file of pending) {
      process.stdout.write(`→ ${file} ... `);
      // Multi-statement query strings run in an implicit transaction, so a
      // failure rolls the whole file back.
      await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log('ok');
    }
    console.log(`✅ Applied ${pending.length} migration(s)`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  console.error('   No partial changes were left behind — fix the file and re-run.');
  process.exit(1);
});
