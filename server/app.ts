import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import { db } from './db.ts'
import { HttpError } from './errors.ts'
import { browserErrorTracking, reportError } from './errorTracking.ts'
import { say } from './i18n/index.ts'
import type { Text } from './i18n/index.ts'
import { accountRoutes } from './routes/account.ts'
import { billingRoutes } from './routes/billing.ts'
import { builderRoutes } from './routes/builders.ts'
import { jobRoutes } from './routes/jobs.ts'
import { liveRoutes } from './routes/live.ts'
import { messageRoutes } from './routes/messages.ts'
import { projectRoutes } from './routes/projects.ts'
import { workRoutes } from './routes/work.ts'

/**
 * TRUST_PROXY: how many proxies (like Caddy) sit in front, so req.ip is the visitor's real address.
 * "true" counts as one: trusting every proxy would let visitors make up their address in an
 * X-Forwarded-For header and get around the login limits. Addresses or subnets work too.
 */
export function trustProxySetting(value: string | undefined): boolean | number | string {
  if (!value || value === 'false') return false
  if (/^\d+$/.test(value)) return Number(value)
  return value === 'true' ? 1 : value
}

export interface AppOptions {
  /** Also serve the built web app (from distDir), with security headers. */
  production: boolean
  distDir: string
  /** Where the web app sends its errors, if anywhere (see errorTracking.ts). */
  errorTracking: ReturnType<typeof browserErrorTracking>
}

const defaults: AppOptions = {
  production: process.env.NODE_ENV === 'production',
  distDir: fileURLToPath(new URL('../dist/', import.meta.url)),
  errorTracking: browserErrorTracking(),
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The built app's page, telling the app where to send its errors (src/errorTracking.ts reads it). */
export function pageWithSettings(html: string, errorTracking: AppOptions['errorTracking']) {
  if (!errorTracking) return html
  const { dsn, environment, release } = errorTracking
  const meta = `<meta name="error-tracking" content="${escapeAttribute(JSON.stringify({ dsn, environment, release }))}" />`
  return html.replace('</head>', `    ${meta}\n  </head>`)
}

/** The API as an Express app. index.ts starts it; tests call it directly. */
export function createApp(options: AppOptions = defaults) {
  const app = express()
  app.set('trust proxy', trustProxySetting(process.env.TRUST_PROXY))
  app.disable('x-powered-by')

  if (options.production) {
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            // blob: for previews of photos picked but not uploaded yet.
            'img-src': ["'self'", 'data:', 'blob:'],
            // The app sends its errors straight to Sentry, when they're tracked.
            'connect-src': ["'self'", ...(options.errorTracking ? [options.errorTracking.origin] : [])],
            // Leave plain http alone, so the production build can also be tried locally.
            'upgrade-insecure-requests': null,
          },
        },
      }),
    )
  }
  app.use(express.json({ limit: '50kb' }))

  // For uptime checks and container health checks.
  app.get('/api/health', async (_req, res) => {
    try {
      await db.query('SELECT 1')
      res.json({ ok: true })
    } catch {
      res.status(503).json({ ok: false })
    }
  })

  app.use(
    '/api',
    accountRoutes,
    builderRoutes,
    jobRoutes,
    projectRoutes,
    workRoutes,
    billingRoutes,
    messageRoutes,
    liveRoutes,
  )
  app.use('/api', (req, res) => {
    res.status(404).json({ error: say(req, (m) => m.general.notFound) })
  })

  if (options.production) {
    app.use(
      express.static(options.distDir, {
        index: false,
        setHeaders(res, path) {
          // Built files have a content hash in their name, so they never change.
          const built = path.startsWith(join(options.distDir, 'assets'))
          res.set('Cache-Control', built ? 'public, max-age=31536000, immutable' : 'no-cache')
        },
      }),
    )
    // Any other page (like /projects/12 or /invite from an email link) is handled by the app itself.
    // The page is read once: a new build comes with a new server.
    let page: Promise<string> | undefined
    app.use(async (req, res, next) => {
      if (req.method !== 'GET') return next()
      page ??= readFile(join(options.distDir, 'index.html'), 'utf8').then((html) =>
        pageWithSettings(html, options.errorTracking),
      )
      const html = await page.catch((err) => {
        page = undefined
        throw err
      })
      res.set('Cache-Control', 'no-cache').type('html').send(html)
    })
  }

  app.use((err: { status?: number; code?: string }, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: say(req, err.text) })
      return
    }
    const status = err.status && err.status < 500 ? err.status : 500
    // The path, not the whole address: some links carry a token in the query.
    if (status === 500) reportError('Request failed', err, { request: `${req.method} ${req.path}` })
    let message: Text = (m) => m.general.invalidRequest
    if (err.code === 'ECONNREFUSED') message = (m) => m.general.noDatabase
    else if (status === 413) message = (m) => m.general.fileTooBig
    else if (status === 500) message = (m) => m.general.serverError
    res.status(status).json({ error: say(req, message) })
  })

  return app
}

export const app = createApp()
