import { afterAll, beforeEach } from 'vitest'
import { outbox } from '../mailer.ts'
import { resetRateLimits } from '../rateLimit.ts'
import { TEST_DB } from './testDb.ts'

// A safety net: the API tests empty tables, so they must never run against the real database.
if (process.env.DB_NAME !== TEST_DB) {
  throw new Error(`The API tests must use the ${TEST_DB} database, not ${process.env.DB_NAME ?? 'the default one'}.`)
}

// Each test starts with no emails and no counted attempts.
beforeEach(() => {
  outbox.length = 0
  resetRateLimits()
})

afterAll(async () => {
  const { db } = await import('../db.ts')
  await db.end()
})
