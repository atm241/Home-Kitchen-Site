import { defineConfig, devices } from '@playwright/test';

// Runs against the throwaway stack from `npm run stack:up` (port 3100, its
// own database), never the real app on 3000.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    // The household mostly uses the app on iPhones; WebKit is Safari's engine.
    { name: 'iphone-safari', use: { ...devices['iPhone 13'] } },
  ],
});
