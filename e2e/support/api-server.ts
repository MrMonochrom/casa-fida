// Starts the API server for the browser tests: a fresh test database with the sample data, rate
// limits off (the scenarios log in a lot), and every email written to a folder they can read.
// Playwright runs this itself (see playwright.config.ts); `node e2e/support/api-server.ts` works too.
import { rmSync } from 'node:fs'
import { createDatabase } from './database.ts'
import { API_PORT, E2E_DB, MAIL_DIR, WEB_URL } from './settings.ts'

Object.assign(process.env, {
  DB_NAME: E2E_DB,
  PORT: String(API_PORT),
  RATE_LIMITS: 'off',
  MAIL_DIR,
  APP_URL: WEB_URL,
  SMTP_URL: '',
})

await createDatabase()
rmSync(MAIL_DIR, { recursive: true, force: true })
await import('../../server/index.ts')
