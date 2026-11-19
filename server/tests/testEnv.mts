// Environment every test process runs with. Shared by vitest.config.ts (which
// injects it into the test workers) and globalSetup.ts (which builds the DB).

/** Started by `npm run test:db`; CI provides the same via a service container. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://simmer:simmer@127.0.0.1:5433/simmer_test';

export const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'test-secret-not-for-production',
  CLIENT_URL: 'http://localhost:3000',
  // Never call paid or external APIs from tests. dotenv won't overwrite
  // variables that already exist, so these blanks beat server/.env. The base
  // URL makes any Anthropic call that slips through fail instantly instead
  // of reaching the real API.
  ANTHROPIC_API_KEY: '',
  ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
  SPOONACULAR_API_KEY: '',
  INSTAGRAM_OEMBED_TOKEN: '',
  KROGER_CLIENT_ID: '',
  KROGER_CLIENT_SECRET: '',
  KROGER_API_BASE: 'http://127.0.0.1:9',
  AI_DAILY_LIMIT_VIDEO: '',
  AI_DAILY_LIMIT_PHOTO: '',
  AI_DAILY_LIMIT_RECEIPT: '',
};

/** Refuses anything but a database whose name ends in _test. */
export function assertTestDatabase(url: string): URL {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against "${name}": the test database name must end in _test, ` +
        'because the suite drops and recreates it.'
    );
  }
  return parsed;
}
