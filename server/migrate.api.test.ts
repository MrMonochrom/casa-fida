import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import mysql from 'mysql2/promise'
import type { RowDataPacket } from 'mysql2/promise'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { migrate, migrationFiles } from './migrate.ts'
import { storage } from './storage.ts'
import { TEST_FILES, connectionOptions } from './test/testDb.ts'

// A database of their own, made and dropped by these tests.
const DB = 'casa_fida_migrate_test'
let conn: mysql.Connection
const logged: string[] = []
const run = (options: { dir?: URL } = {}) =>
  migrate({ connection: connectionOptions, database: DB, log: (line) => logged.push(line), ...options })

const tablesOf = async () => {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
    [DB],
  )
  return rows.map((r) => r.name).sort()
}
const recorded = async () => {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT name FROM ${DB}.schema_migrations ORDER BY name`)
  return rows.map((r) => r.name)
}
const columnsOf = async (table: string) => {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?',
    [DB, table],
  )
  return rows.map((r) => r.name)
}

beforeAll(async () => {
  conn = await mysql.createConnection({ ...connectionOptions, multipleStatements: true })
})
afterEach(async () => {
  logged.length = 0
  vi.restoreAllMocks()
  await conn.query(`DROP DATABASE IF EXISTS ${DB}`)
})
afterAll(() => conn.end())

/**
 * A database as the app made it before migrations were recorded and before 005: from today's
 * tables, without the ones 005 to 010 added, and with a photo kept in MySQL.
 */
async function databaseFromBefore() {
  await run()
  const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6])
  await conn.query(`
    USE ${DB};
    DROP TABLE schema_migrations;
    ALTER TABLE projects DROP COLUMN invite_emailed;
    ALTER TABLE builder_trades DROP COLUMN position;
    ALTER TABLE update_photos DROP COLUMN storage_key, ADD COLUMN data MEDIUMBLOB NOT NULL AFTER mime_type;
    INSERT INTO users (id, email, name, role) VALUES (1, 'bob@example.com', 'Bob', 'builder'), (2, 'ana@example.com', 'Ana', 'client');
    INSERT INTO builder_trades (user_id, trade) VALUES (1, 'roofing'), (1, 'decks');
    INSERT INTO projects (id, builder_id, client_id, client_name, client_email, title, description, contract_amount, status)
      VALUES (1, 1, 2, 'Ana', 'ana@example.com', 'Roof', 'New roof', 100000, 'active');
    INSERT INTO updates (id, project_id, author_id, body) VALUES (1, 1, 1, 'Started');
  `)
  await conn.query(`INSERT INTO ${DB}.update_photos (id, update_id, mime_type, data) VALUES (1, 1, 'image/jpeg', ?)`, [photo])
  logged.length = 0
  return photo
}

describe('migrations', () => {
  it('make the tables in an empty database, with every migration recorded as done', async () => {
    expect(await run()).toEqual([])
    expect(logged).toEqual([`Created the tables in ${DB} from db/schema.sql.`])
    expect(await tablesOf()).toContain('users')
    // db/schema.sql has to list every file in db/migrations, since its tables already have them.
    expect(await recorded()).toEqual(await migrationFiles())

    logged.length = 0
    expect(await run()).toEqual([])
    expect(logged).toEqual([`${DB} was already up to date.`])
  })

  it('bring a database from before they were recorded up to date, moving its photos out of MySQL', async () => {
    const photo = await databaseFromBefore()
    const ran = await run()

    expect(ran).toEqual((await migrationFiles()).filter((file) => file >= '005'))
    expect(logged[0]).toBe(
      `${DB} was made before migrations were recorded. It already has: 001-currencies.sql, 002-email-verification.sql, ` +
        '003-password-reset-and-notifications.sql, 004-builder-plans.sql.',
    )
    expect(logged).toContain(`  Moving 1 photos to the folder ${TEST_FILES}...`)
    expect(await recorded()).toEqual(await migrationFiles())

    // 006 kept the trades in alphabetical order.
    const [trades] = await conn.query<RowDataPacket[]>(`SELECT trade, position FROM ${DB}.builder_trades ORDER BY position`)
    expect(trades.map((t) => t.trade)).toEqual(['decks', 'roofing'])
    // The photo is in file storage, the same as it was, and no longer in MySQL.
    expect(await columnsOf('update_photos')).not.toContain('data')
    const [[moved]] = await conn.query<RowDataPacket[]>(`SELECT storage_key FROM ${DB}.update_photos WHERE id = 1`)
    expect(moved.storage_key).toMatch(/^photos\/1\/[0-9a-f-]{36}\.jpg$/)
    expect(readFileSync(join(TEST_FILES, moved.storage_key))).toEqual(photo)
  })

  it("keep a photo in MySQL if it doesn't read back the same from file storage", async () => {
    const photo = await databaseFromBefore()
    vi.spyOn(storage, 'get').mockResolvedValue(Buffer.from('something else'))
    await expect(run()).rejects.toThrow("009-photos-to-file-storage.ts failed: Photo 1 didn't read back the same")

    expect(await recorded()).not.toContain('009-photos-to-file-storage.ts')
    const [[kept]] = await conn.query<RowDataPacket[]>(`SELECT storage_key, data FROM ${DB}.update_photos WHERE id = 1`)
    expect(kept).toEqual({ storage_key: null, data: photo })

    // Once storage works again, running the migrations again finishes the move.
    vi.restoreAllMocks()
    expect(await run()).toEqual(['009-photos-to-file-storage.ts', '010-photos-out-of-mysql.sql'])
    expect(await columnsOf('update_photos')).not.toContain('data')
  })

  describe('from a folder of their own', () => {
    const dir = mkdtempSync(join(tmpdir(), 'casa-fida-migrations-'))
    const url = pathToFileURL(`${dir}/`)
    afterAll(() => rmSync(dir, { recursive: true, force: true }))

    async function recordedDatabase() {
      await conn.query(`
        CREATE DATABASE ${DB};
        CREATE TABLE ${DB}.schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE ${DB}.notes (body VARCHAR(100));
      `)
    }

    it('run in order, each once, and stop at one that fails until it works', async () => {
      await recordedDatabase()
      writeFileSync(join(dir, '001-first.sql'), "INSERT INTO notes VALUES ('one');\nINSERT INTO notes VALUES ('two');")
      writeFileSync(join(dir, '002-broken.sql'), 'INSERT INTO no_such_table VALUES (1);')
      writeFileSync(join(dir, 'README.md'), 'Not a migration.')

      await expect(run({ dir: url })).rejects.toThrow(/^002-broken\.sql failed: Table '.*no_such_table' doesn't exist/)
      expect(await recorded()).toEqual(['001-first.sql'])

      writeFileSync(join(dir, '002-broken.sql'), "INSERT INTO notes VALUES ('three');")
      expect(await run({ dir: url })).toEqual(['002-broken.sql'])
      const [notes] = await conn.query<RowDataPacket[]>(`SELECT body FROM ${DB}.notes`)
      expect(notes.map((n) => n.body)).toEqual(['one', 'two', 'three'])
    })

    it("mention migrations the database has had that this copy of the app doesn't have", async () => {
      await recordedDatabase()
      await conn.query(`INSERT INTO ${DB}.schema_migrations (name) VALUES ('001-first.sql'), ('002-broken.sql'), ('099-newer.sql')`)
      expect(await run({ dir: url })).toEqual([])
      expect(logged[0]).toBe(
        `Note: ${DB} has had migrations this copy of the app doesn't have: 099-newer.sql. Is it an older version?`,
      )
    })
  })
})
