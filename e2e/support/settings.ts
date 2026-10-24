// Where the browser tests run their own copy of Casa Fida. Different ports and a different database
// from `npm run dev`, so both can run at once and the tests never touch your data.
import { fileURLToPath } from 'node:url'

export const API_PORT = 3102
export const WEB_PORT = 5184
export const API_URL = `http://127.0.0.1:${API_PORT}`
export const WEB_URL = `http://localhost:${WEB_PORT}`

/** Rebuilt from db/schema.sql when the tests start, and reloaded with db/seed.sql before each scenario. */
export const E2E_DB = 'casa_fida_e2e'

/** The test server writes every email here (see MAIL_DIR in server/mailer.ts). */
export const MAIL_DIR = fileURLToPath(new URL('../.mail/', import.meta.url))

/** Each run's results for the Allure report (see allurerc.mjs). Emptied when a run starts. */
export const ALLURE_RESULTS = fileURLToPath(new URL('../allure-results/', import.meta.url))

/** The password of every sample account in db/seed.sql. */
export const SAMPLE_PASSWORD = 'CasaFida123'

/** The password the scenarios give new accounts. */
export const NEW_PASSWORD = 'NewPassword123'
