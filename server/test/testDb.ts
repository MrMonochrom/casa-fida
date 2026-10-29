// The API tests use their own database, created fresh for each run, so they never touch your real data.
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const TEST_DB = 'casa_fida_test'

/** The API tests' photos, in a folder of their own: emptied when they start and removed when they end. */
export const TEST_FILES = join(tmpdir(), 'casa-fida-test-files')

export const connectionOptions = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3307),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
}
