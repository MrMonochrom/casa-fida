// Brings a database up to date. The files in db/migrations each change the tables (or the data in
// them) once, in order; the database's schema_migrations table lists the ones it has had, so each
// runs only once. `npm run db:migrate` runs this (see scripts/migrate.ts), and so does the Docker
// image each time it starts.
//
// A migration is a .sql file of statements, or a .ts file whose default export does the work (for
// changes SQL can't make, like moving photos into file storage). Name new ones with the next number.
import { readdir, readFile } from 'node:fs/promises'
import mysql from 'mysql2/promise'
import type { RowDataPacket } from 'mysql2/promise'

const DB_DIR = new URL('../db/', import.meta.url)
const MIGRATIONS_DIR = new URL('migrations/', DB_DIR)

/** What a .ts migration's default export is given. */
export interface MigrationContext {
  /** A connection to the database being migrated. It allows several statements in one query. */
  db: mysql.Connection
  log: (line: string) => void
}

export type Migration = (context: MigrationContext) => Promise<void>

export interface MigrateOptions {
  /** Where MySQL is, and who to log in as, without a database. */
  connection: mysql.ConnectionOptions
  database: string
  log?: (line: string) => void
  /** Where the migrations are, if not db/migrations (for tests). */
  dir?: URL
}

/** The files in db/migrations, in the order they run. */
export async function migrationFiles(dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = await readdir(dir)
  return files.filter((name) => /^\d{3}-[\w.-]+\.(sql|ts)$/.test(name) && !name.endsWith('.test.ts')).sort()
}

/**
 * Databases made before migrations were recorded don't say which they've had. These are the ones
 * from then, each with a column it added: a database with that column has had that file. (007 only
 * changed data, and running it again changes nothing, so it simply runs.)
 */
const BEFORE_RECORDS: [file: string, table: string, column: string][] = [
  ['001-currencies.sql', 'jobs', 'currency'],
  ['002-email-verification.sql', 'users', 'email_verified_at'],
  ['003-password-reset-and-notifications.sql', 'users', 'reset_token_hash'],
  ['004-builder-plans.sql', 'users', 'plan'],
  ['005-emailed-invite-links.sql', 'projects', 'invite_emailed'],
  ['006-trade-order.sql', 'builder_trades', 'position'],
]

const RECORDS_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)`

const quoteName = (name: string) => `\`${name.replace(/`/g, '``')}\``

async function tablesIn(conn: mysql.Connection, database: string): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
    [database],
  )
  return rows.map((r) => r.name)
}

/** Which of BEFORE_RECORDS a database made before migrations were recorded has had. */
async function hadBeforeRecords(conn: mysql.Connection, database: string): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.columns WHERE table_schema = ?',
    [database],
  )
  const columns = new Set(rows.map((r) => `${r.t}.${r.c}`))
  return BEFORE_RECORDS.filter(([, table, column]) => columns.has(`${table}.${column}`)).map(([file]) => file)
}

/** The migrations a database has had, according to its schema_migrations table. */
async function recorded(conn: mysql.Connection): Promise<Set<string>> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT name FROM schema_migrations')
  return new Set(rows.map((r) => r.name))
}

/**
 * Brings `database` up to date, and returns the migrations it ran. An empty (or missing) database
 * gets the tables from db/schema.sql, which already include every migration.
 */
export async function migrate({ connection, database, log = console.log, dir = MIGRATIONS_DIR }: MigrateOptions): Promise<string[]> {
  const conn = await mysql.createConnection({ ...connection, multipleStatements: true, charset: 'utf8mb4' })
  // Two servers starting at once take turns.
  const lock = `migrations:${database}`
  try {
    const [[{ locked }]] = await conn.query<RowDataPacket[]>('SELECT GET_LOCK(?, 300) AS locked', [lock])
    if (locked !== 1) throw new Error(`Another migration of ${database} has been running for 5 minutes.`)

    const files = await migrationFiles(dir)
    const tables = await tablesIn(conn, database)
    if (tables.length === 0) {
      const schema = await readFile(new URL('schema.sql', DB_DIR), 'utf8')
      await conn.query(schema.replace(/\bcasa_fida\b/g, database))
      log(`Created the tables in ${database} from db/schema.sql.`)
      return []
    }

    await conn.query(`USE ${quoteName(database)}`)
    if (!tables.includes('schema_migrations')) {
      await conn.query(RECORDS_TABLE)
      const had = await hadBeforeRecords(conn, database)
      if (had.length > 0) {
        await conn.query('INSERT INTO schema_migrations (name) VALUES ?', [had.map((name) => [name])])
        log(`${database} was made before migrations were recorded. It already has: ${had.join(', ')}.`)
      }
    }

    const done = await recorded(conn)
    const unknown = [...done].filter((name) => !files.includes(name))
    if (unknown.length > 0) {
      log(`Note: ${database} has had migrations this copy of the app doesn't have: ${unknown.join(', ')}. Is it an older version?`)
    }

    const ran: string[] = []
    for (const name of files.filter((file) => !done.has(file))) {
      log(`Running ${name}...`)
      try {
        if (name.endsWith('.sql')) {
          await conn.query(await readFile(new URL(name, dir), 'utf8'))
        } else {
          const migration = (await import(new URL(name, dir).href)).default as Migration
          await migration({ db: conn, log: (line) => log(`  ${line}`) })
        }
      } catch (err) {
        throw new Error(
          `${name} failed: ${(err as Error).message}\n` +
            "MySQL can't undo changes to tables, so check what it changed before running it again.",
          { cause: err },
        )
      }
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [name])
      ran.push(name)
    }
    log(ran.length > 0 ? `${database} is up to date.` : `${database} was already up to date.`)
    return ran
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [lock]).catch(() => {})
    await conn.end()
  }
}

/** The migrations `db` hasn't had: none for a database that's up to date. */
export async function pendingMigrations(db: mysql.Pool): Promise<string[]> {
  const files = await migrationFiles()
  try {
    const [rows] = await db.query<RowDataPacket[]>('SELECT name FROM schema_migrations')
    const done = new Set(rows.map((r) => r.name))
    return files.filter((file) => !done.has(file))
  } catch (err) {
    // Made before migrations were recorded: every one might be missing.
    if ((err as { code?: string }).code === 'ER_NO_SUCH_TABLE') return files
    throw err
  }
}
