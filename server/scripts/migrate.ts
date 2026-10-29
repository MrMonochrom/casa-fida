// Brings the database up to date by running the files in db/migrations it hasn't had yet (see
// server/migrate.ts). An empty database gets the tables from db/schema.sql.
//   npm run db:migrate
// It uses the same settings as the server (DB_HOST, DB_NAME…). The Docker image runs it each time
// it starts, and `npm run db:start` after starting MySQL.
import { connectionSettings, databaseName } from '../db.ts'
import { migrate } from '../migrate.ts'

try {
  await migrate({ connection: connectionSettings, database: databaseName })
} catch (err) {
  const { code, message } = err as { code?: string; message: string }
  console.error(
    code === 'ECONNREFUSED'
      ? `Can't reach MySQL at ${connectionSettings.host}:${connectionSettings.port}. Is it running? (npm run db:start)`
      : message,
  )
  process.exitCode = 1
}
