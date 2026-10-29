// Errors are written to the log and, when SENTRY_DSN is set, sent to Sentry (sentry.io, or a
// Sentry-compatible service like GlitchTip), which groups them and emails about new ones. The web
// app sends its own errors there too: see browserErrorTracking below and src/errorTracking.ts.
import * as Sentry from '@sentry/node'

// || rather than ??: an empty setting (as Docker Compose passes for unset ones) counts as unset.
const dsn = process.env.SENTRY_DSN || ''
const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'
/** Which version of the app is running (the Docker image is given its git commit when built). */
const release = process.env.APP_VERSION || undefined

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    // Errors only, with no performance tracing. Nothing about the people using the app goes with
    // them: no cookies, headers or request bodies (logins carry passwords), no query values, and no
    // local variables or database values from where the error happened.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    integrations: [
      // A promise nobody handled still stops the server, as it does without Sentry (and Docker
      // starts it again); Sentry hears about it first.
      Sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
    ],
  })
}

export const errorTrackingIsOn = () => dsn !== ''

/**
 * Logs an error and sends it to Sentry. `what` says what was going on, like "Proposal email failed";
 * `details` adds more, like which request it was.
 */
export function reportError(what: string, err: unknown, details?: Record<string, string>) {
  console.error(`${what}:`, err)
  if (dsn) Sentry.captureException(err, { tags: { what }, extra: details })
}

/** Waits (up to 2 seconds) for errors still being sent, before the server stops. */
export async function flushErrors() {
  if (dsn) await Sentry.flush(2000)
}

/**
 * What the web app needs to send its errors to the same place, or null if they aren't tracked.
 * The DSN is meant to be public: it only lets people send errors.
 */
export function browserErrorTracking() {
  if (!dsn) return null
  return { dsn, environment, release, origin: new URL(dsn).origin }
}
