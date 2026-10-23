import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import { db } from './db.ts'
import { HttpError } from './errors.ts'
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
}

const defaults: AppOptions = {
  production: process.env.NODE_ENV === 'production',
  distDir: fileURLToPath(new URL('../dist/', import.meta.url)),
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
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next()
      res.set('Cache-Control', 'no-cache')
      res.sendFile(join(options.distDir, 'index.html'))
    })
  }

  app.use((err: { status?: number; code?: string }, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: say(req, err.text) })
      return
    }
    const status = err.status && err.status < 500 ? err.status : 500
    if (status === 500) console.error(err)
    let message: Text = (m) => m.general.invalidRequest
    if (err.code === 'ECONNREFUSED') message = (m) => m.general.noDatabase
    else if (status === 413) message = (m) => m.general.fileTooBig
    else if (status === 500) message = (m) => m.general.serverError
    res.status(status).json({ error: say(req, message) })
  })

  return app
}

export const app = createApp()
