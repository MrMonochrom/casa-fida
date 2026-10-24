// Starts the API server for the browser tests: a fresh test database with the sample data, rate
// limits off (the scenarios log in a lot), and every email written to a folder they can read.
// Playwright runs this itself (see playwright.config.ts); `node e2e/support/api-server.ts` works too.
import { rmSync } from 'node:fs'
import { createDatabase } from './database.ts'
import { API_PORT, API_URL, E2E_DB, MAIL_DIR, WEB_URL } from './settings.ts'

// Set before the server's modules load: they read these when they do.
Object.assign(process.env, {
  DB_NAME: E2E_DB,
  RATE_LIMITS: 'off',
  MAIL_DIR,
  APP_URL: WEB_URL,
  SMTP_URL: '',
})

await createDatabase()
rmSync(MAIL_DIR, { recursive: true, force: true })

// The app on its own rather than server/index.ts, which also starts the hourly check for overdue
// invoices and daily job emails: that would send emails in the middle of whichever scenario is running.
const { app } = await import('../../server/app.ts')
app.listen(API_PORT, '127.0.0.1', () => console.log(`Browser tests' API listening on ${API_URL}`))
