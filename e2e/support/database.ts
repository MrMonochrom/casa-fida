// The browser tests' own database: built from db/schema.sql and filled with db/seed.sql, the same
// sample data as `npm run db:start`. Each scenario starts from a fresh copy of it.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import type { RowDataPacket } from 'mysql2/promise'
import { connectionOptions } from '../../server/test/testDb.ts'
import { E2E_DB } from './settings.ts'

/** A file from db/, pointed at the test database instead of casa_fida. */
const sql = (file: string) =>
  readFileSync(new URL(`../../db/${file}`, import.meta.url), 'utf8').replace(/\bcasa_fida\b/g, E2E_DB)

const SEED = sql('seed.sql')

export type Database = mysql.Connection

/** Drops the test database if it's there, and makes it again with the sample data. */
export async function createDatabase() {
  let conn: mysql.Connection
  try {
    conn = await mysql.createConnection({ ...connectionOptions, multipleStatements: true })
  } catch (err) {
    throw new Error(`The browser tests need MySQL. Start it with: npm run db:start (${(err as Error).message})`)
  }
  try {
    await conn.query(`DROP DATABASE IF EXISTS ${E2E_DB}`)
    await conn.query(sql('schema.sql'))
    await conn.query(SEED)
  } finally {
    await conn.end()
  }
}

export function connect(): Promise<Database> {
  return mysql.createConnection({ ...connectionOptions, database: E2E_DB, multipleStatements: true, dateStrings: true })
}

/** Empties every table and loads the sample data again. */
export async function reloadSampleData(db: Database) {
  const [tables] = await db.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
    [E2E_DB],
  )
  await db.query('SET FOREIGN_KEY_CHECKS = 0')
  try {
    for (const { name } of tables) await db.query(`DELETE FROM \`${name}\``)
  } finally {
    await db.query('SET FOREIGN_KEY_CHECKS = 1')
  }
  await db.query(SEED)
}
