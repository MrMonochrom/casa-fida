import type { RowDataPacket } from 'mysql2/promise'
import { app } from './app.ts'
import { db } from './db.ts'
import { errorTrackingIsOn, flushErrors } from './errorTracking.ts'
import { closeAllStreams } from './events.ts'
import { emailIsSetUp } from './mailer.ts'
import { pendingMigrations } from './migrate.ts'
import { startReminders } from './notifications.ts'
import { storage } from './storage.ts'

// 3002, so Be in touch's API (3001) can run at the same time.
const PORT = Number(process.env.PORT || 3002)
// Only this computer by default. In a container, set HOST=0.0.0.0.
const HOST = process.env.HOST || '127.0.0.1'

if (process.env.NODE_ENV === 'production') {
  const missing = [
    !process.env.APP_URL && 'APP_URL (links in emails point to localhost)',
    !emailIsSetUp() && 'SMTP_URL (emails are printed to the log instead of sent)',
    !process.env.DB_PASSWORD && 'DB_PASSWORD (connecting to MySQL without a password)',
    storage.onThisComputer && `S3_BUCKET (photos are kept in the ${storage.description}, and lost if this server is)`,
    !errorTrackingIsOn() && 'SENTRY_DSN (errors are only written to the log)',
  ].filter(Boolean)
  for (const setting of missing) console.warn(`Warning: ${setting} isn't set.`)
}

try {
  const pending = await pendingMigrations(db)
  if (pending.length > 0) {
    console.warn(`Warning: the database is missing ${pending.join(', ')}. Bring it up to date with: npm run db:migrate`)
  }
  // db/seed.sql's sample accounts all have the same published password.
  if (process.env.NODE_ENV === 'production') {
    const [rows] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@example.com'")
    if (rows[0].n > 0) {
      console.warn(
        `Warning: ${rows[0].n} sample accounts from db/seed.sql are in the database, with a published password. Delete them.`,
      )
    }
  }
} catch {
  // The database isn't reachable yet; requests will say so.
}

const server = app.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`)
})

// Emails clients about invoices that become overdue.
startReminders()

// Docker (and Ctrl+C) ask the server to stop: it finishes what it's answering, ends live updates
// (the app reconnects to the next server), sends any errors still on their way, and goes.
let stopping = false
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    if (stopping) process.exit(1)
    stopping = true
    const closed = new Promise((done) => server.close(done))
    closeAllStreams()
    server.closeIdleConnections()
    // Docker stops it for good after 10 seconds.
    setTimeout(() => server.closeAllConnections(), 5000).unref()
    await Promise.all([closed, flushErrors()])
    await db.end()
    process.exit(0)
  })
}
