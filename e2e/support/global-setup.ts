// Runs once before the browser tests. The Allure report is made from every result in
// e2e/allure-results, so the last run's results go first.
import { rmSync } from 'node:fs'
import { ALLURE_RESULTS } from './settings.ts'

export default function globalSetup() {
  rmSync(ALLURE_RESULTS, { recursive: true, force: true })
}
