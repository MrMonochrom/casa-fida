import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { TEST_DB } from './server/test/testDb.ts'

export default defineConfig({
  test: {
    projects: [
      {
        // React app, in a simulated browser.
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        // Server logic and shared rules that don't need a database.
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
          exclude: ['server/**/*.api.test.ts'],
        },
      },
      {
        // Every API endpoint, against a separate test database. Needs MySQL running (npm run db:start).
        test: {
          name: 'api',
          environment: 'node',
          include: ['server/**/*.api.test.ts'],
          globalSetup: ['server/test/globalSetup.ts'],
          setupFiles: ['server/test/setup.ts'],
          // Rate limits are off, except in the tests about them (they switch them back on).
          env: { DB_NAME: TEST_DB, RATE_LIMITS: 'off' },
          // The test files share one database, so they run one at a time.
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.test.{ts,tsx}', 'src/test/**', 'server/test/**', 'src/main.tsx', 'server/index.ts'],
      reporter: ['text', 'html'],
    },
  },
})
