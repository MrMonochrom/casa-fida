// Browser tests: the scenarios in e2e/features, written in Gherkin and run by Playwright through
// playwright-bdd. Run them with `npm run test:e2e` (MySQL has to be running: npm run db:start),
// then see the Allure report with `npm run test:e2e:allure`.
import { defineConfig, devices } from '@playwright/test'
import { cucumberReporter, defineBddConfig } from 'playwright-bdd'
import { ALLURE_RESULTS, API_PORT, API_URL, WEB_PORT, WEB_URL } from './e2e/support/settings.ts'

const testDir = defineBddConfig({
  features: 'e2e/features/*.feature',
  featuresRoot: 'e2e/features',
  steps: 'e2e/steps/*.ts',
  outputDir: 'e2e/.features-gen',
})

const ci = !!process.env.CI

export default defineConfig({
  testDir,
  // Every scenario starts from the same sample data in one shared database, so they take turns.
  workers: 1,
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: 'e2e/results',
  globalSetup: './e2e/support/global-setup.ts',
  reporter: [
    [ci ? 'github' : 'list'],
    ['html', { outputFolder: 'e2e/report/playwright', open: 'never' }],
    cucumberReporter('html', { outputFile: 'e2e/report/cucumber.html' }),
    [
      'allure-playwright',
      {
        resultsDir: ALLURE_RESULTS,
        environmentInfo: { 'Web app': WEB_URL, 'Node.js': process.version, OS: `${process.platform} ${process.arch}` },
      },
    ],
  ],
  use: {
    baseURL: WEB_URL,
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Playwright's light headless build of Chromium: quickest, and what `npm run test:e2e` uses.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The full browser, Google Chrome for Testing: `npm run test:e2e:chrome`.
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
  ],
  webServer: [
    {
      // A fresh test database with the sample data, then the API server on it.
      command: 'node e2e/support/api-server.ts',
      url: `${API_URL}/api/health`,
      reuseExistingServer: !ci,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      env: { API_URL: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: !ci,
      timeout: 60_000,
    },
  ],
})
