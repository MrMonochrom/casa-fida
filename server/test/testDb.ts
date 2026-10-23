// The API tests use their own database, created fresh for each run, so they never touch your real data.
export const TEST_DB = 'casa_fida_test'

export const connectionOptions = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3307),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
}
