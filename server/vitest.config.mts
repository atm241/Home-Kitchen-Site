import { defineConfig } from 'vitest/config';
import { testEnv } from './tests/testEnv.mts';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    env: testEnv,
    // Each file gets its own process, app and DB pool. Files share the test
    // database but create their own users, so they never collide.
    pool: 'forks',
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
