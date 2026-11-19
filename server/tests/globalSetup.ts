// Runs once before the whole suite: drops and recreates the test database,
// then builds it exactly the way a new install does (schema.sql, then every
// migration through migrate.js), so tests also catch a broken migration.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { Client } from 'pg';
import { TEST_DATABASE_URL, assertTestDatabase } from './testEnv.mts';

const SERVER_DIR = path.join(__dirname, '..');

export default async function setup() {
  const target = assertTestDatabase(TEST_DATABASE_URL);
  const dbName = target.pathname.slice(1);
  const admin = new URL(target.toString());
  admin.pathname = '/postgres';

  const adminClient = new Client({ connectionString: admin.toString() });
  try {
    await adminClient.connect();
  } catch (error) {
    throw new Error(
      `Can't reach the test database at ${admin.host} (${(error as Error).message}).\n` +
        'Start it with:  npm run test:db'
    );
  }
  // WITH (FORCE) drops connections left over from an interrupted run.
  await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await adminClient.query(`CREATE DATABASE "${dbName}"`);
  await adminClient.end();

  const db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  await db.query(fs.readFileSync(path.join(SERVER_DIR, 'schema.sql'), 'utf8'));
  await db.end();

  execFileSync('node', ['migrate.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
