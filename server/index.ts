import type { RowDataPacket } from 'mysql2/promise'
import { app } from './app.ts'
import { db } from './db.ts'
import { emailIsSetUp } from './mailer.ts'

// 3002, so Be in touch's API (3001) can run at the same time.
const PORT = Number(process.env.PORT || 3002)
// Only this computer by default. In a container, set HOST=0.0.0.0.
const HOST = process.env.HOST || '127.0.0.1'

if (process.env.NODE_ENV === 'production') {
  const missing = [
    !process.env.APP_URL && 'APP_URL (links in emails point to localhost)',
    !emailIsSetUp() && 'SMTP_URL (emails are printed to the log instead of sent)',
    !process.env.DB_PASSWORD && 'DB_PASSWORD (connecting to MySQL without a password)',
  ].filter(Boolean)
  for (const setting of missing) console.warn(`Warning: ${setting} isn't set.`)

  // db/seed.sql's sample accounts all have the same published password.
  try {
    const [rows] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@example.com'")
    if (rows[0].n > 0) {
      console.warn(
        `Warning: ${rows[0].n} sample accounts from db/seed.sql are in the database, with a published password. Delete them.`,
      )
    }
  } catch {
    // The database isn't reachable yet; requests will say so.
  }
}

app.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`)
})
