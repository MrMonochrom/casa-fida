import mysql from 'mysql2/promise'

// Defaults match the local database started by `npm run db:start`.
export const db = mysql.createPool({
  // || rather than ??: an empty setting (as Docker Compose passes for unset ones) counts as unset.
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'casa_fida',
  charset: 'utf8mb4',
  // Return DATE columns as 'YYYY-MM-DD' strings instead of timezone-shifted Date objects.
  dateStrings: true,
  // Return DECIMAL columns (like SUM results) as numbers instead of strings.
  decimalNumbers: true,
  connectionLimit: 10,
})

const DEADLOCK_RETRIES = 3

/**
 * Runs `work` in a transaction on one connection, committing if it succeeds and rolling back if not.
 * READ COMMITTED avoids the gap locks that make people saving at the same moment deadlock, and if
 * MySQL still picks this transaction to break a deadlock, it's tried again.
 */
export async function inTransaction<T>(work: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const conn = await db.getConnection()
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED')
      await conn.beginTransaction()
      const result = await work(conn)
      await conn.commit()
      return result
    } catch (err) {
      await conn.rollback()
      if ((err as { code?: string }).code !== 'ER_LOCK_DEADLOCK' || attempt === DEADLOCK_RETRIES) throw err
    } finally {
      conn.release()
    }
  }
}

/** A TIMESTAMP column as milliseconds since 1970, for the JSON the app gets. */
export const ms = (column: string) => `UNIX_TIMESTAMP(${column}) * 1000`
