// The Allure report of the browser tests (e2e/). `npm run test:e2e` writes each scenario's result to
// e2e/allure-results; `npm run test:e2e:allure` turns them into this report and opens it.
import { defineConfig } from 'allure'

/** Each browser the scenarios ran in is an environment in the report, with a switch between them. */
const ranIn = (project) => ({ labels }) => labels.some((label) => label.name === 'parentSuite' && label.value === project)

export default defineConfig({
  name: 'Casa Fida browser tests',
  resultsDir: './e2e/allure-results',
  output: './e2e/allure-report',
  // Every report adds its run here, for the trend charts and to spot scenarios that pass only sometimes.
  historyPath: './e2e/allure-history.jsonl',
  historyLimit: 30,
  environments: {
    chromium: { name: 'Chromium', matcher: ranIn('chromium') },
    chrome: { name: 'Chrome for Testing', matcher: ranIn('chrome') },
  },
  plugins: {
    awesome: {
      options: {
        reportLanguage: 'en',
        // Feature, then Scenario Outline (when there is one), then the scenario.
        groupBy: ['feature', 'story'],
        // One HTML file, which also opens straight from a CI download.
        singleFile: true,
      },
    },
  },
})
