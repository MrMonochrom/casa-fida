import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { TEST_DB, connectionOptions } from './testDb.ts'

/** Creates a fresh test database from db/schema.sql before the API tests, and drops it afterwards. */
export default async function setup() {
  let conn: mysql.Connection
  try {
    conn = await mysql.createConnection({ ...connectionOptions, multipleStatements: true })
  } catch (err) {
    throw new Error(`The API tests need MySQL. Start it with: npm run db:start (${(err as Error).message})`)
  }

  const schema = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8').replace(
    /\bcasa_fida\b/g,
    TEST_DB,
  )
  await conn.query(`DROP DATABASE IF EXISTS ${TEST_DB}`)
  await conn.query(schema)
  await conn.end()

  return async () => {
    const cleanup = await mysql.createConnection(connectionOptions)
    await cleanup.query(`DROP DATABASE IF EXISTS ${TEST_DB}`)
    await cleanup.end()
  }
}
