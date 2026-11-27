import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
// E2E_BASE_PATH lets the same specs (and the subpath smoke) run against a
// Pages-style deployment: set E2E_BASE_PATH=/nyan-noodle/ and the webServer
// builds with the matching Vite base.
const BASE_PATH = process.env.E2E_BASE_PATH ?? '/';
const BASE_URL = `http://127.0.0.1:${PORT}${BASE_PATH}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'iphone-touch',
      use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' },
      testMatch: /mobile\.spec\.ts/,
    },
    {
      name: 'pixel-touch',
      use: { ...devices['Pixel 7'], browserName: 'chromium', defaultBrowserType: 'chromium' },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `${BASE_URL}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { E2E_PORT: String(PORT), VITE_BASE: BASE_PATH },
  },
});
