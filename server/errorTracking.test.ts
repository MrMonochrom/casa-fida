import { afterEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
  onUnhandledRejectionIntegration: vi.fn(() => ({ name: 'OnUnhandledRejection' })),
}))
vi.mock('@sentry/node', () => sentry)

/** errorTracking.ts as it starts with these settings. */
async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  return import('./errorTracking.ts')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('error tracking', () => {
  it('is off without SENTRY_DSN: errors are only logged', async () => {
    const tracking = await load({ SENTRY_DSN: '' })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('boom')
    tracking.reportError('Proposal email failed', err)
    expect(log).toHaveBeenCalledWith('Proposal email failed:', err)
    expect(sentry.init).not.toHaveBeenCalled()
    expect(sentry.captureException).not.toHaveBeenCalled()
    expect(tracking.errorTrackingIsOn()).toBe(false)
    expect(tracking.browserErrorTracking()).toBeNull()
    log.mockRestore()
  })

  it('with SENTRY_DSN, sends errors to Sentry with what was going on, and nothing about people', async () => {
    const tracking = await load({
      SENTRY_DSN: 'https://public@o1.ingest.us.sentry.io/2',
      SENTRY_ENVIRONMENT: 'staging',
      APP_VERSION: 'abc123',
    })
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@o1.ingest.us.sentry.io/2',
        environment: 'staging',
        release: 'abc123',
        dataCollection: expect.objectContaining({ cookies: false, httpBodies: [], stackFrameVariables: false }),
      }),
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('boom')
    tracking.reportError('Request failed', err, { request: 'GET /api/me' })
    expect(log).toHaveBeenCalledWith('Request failed:', err)
    expect(sentry.captureException).toHaveBeenCalledWith(err, {
      tags: { what: 'Request failed' },
      extra: { request: 'GET /api/me' },
    })
    expect(tracking.browserErrorTracking()).toEqual({
      dsn: 'https://public@o1.ingest.us.sentry.io/2',
      environment: 'staging',
      release: 'abc123',
      origin: 'https://o1.ingest.us.sentry.io',
    })
    log.mockRestore()
  })
})
