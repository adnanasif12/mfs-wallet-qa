import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = `http://localhost:${PORT}`;
export const TEST_DB_PATH = path.join(__dirname, 'data', 'test-wallet.db');

// Optional: point to a locally installed Chrome (e.g. CHROME_PATH=/usr/bin/google-chrome).
// In CI this stays empty and Playwright uses its own bundled Chromium.
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

export default defineConfig({
  testDir: './tests',
  // All tests share one SQLite database that is reset before each test, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Video needs Playwright's ffmpeg, which CI installs with the browsers.
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },

  projects: [
    { name: 'api', testDir: './tests/api' },
    { name: 'db', testDir: './tests/db' },
    {
      name: 'ui-desktop-chrome',
      testDir: './tests/ui',
      use: { ...devices['Desktop Chrome'], launchOptions },
    },
    {
      name: 'ui-mobile-pixel7',
      testDir: './tests/ui',
      use: { ...devices['Pixel 7'], launchOptions },
    },
  ],

  webServer: {
    command: 'node --no-warnings app/server.js',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      NODE_ENV: 'test',
      PORT: String(PORT),
      DB_PATH: TEST_DB_PATH,
    },
  },
});
