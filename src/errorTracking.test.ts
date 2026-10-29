import { afterEach, describe, expect, it, vi } from 'vitest'

const init = vi.hoisted(() => vi.fn())
vi.mock('@sentry/browser', () => ({ init }))

import { errorTrackingSettings, startErrorTracking, withoutQuery } from './errorTracking.ts'

/** A page as the server sends it, with these error tracking settings (or none). */
function page(content?: string) {
  const doc = document.implementation.createHTMLDocument()
  if (content !== undefined) {
    const meta = doc.createElement('meta')
    meta.name = 'error-tracking'
    meta.content = content
    doc.head.append(meta)
  }
  return doc
}

afterEach(() => init.mockClear())

describe('error tracking in the browser', () => {
  it("doesn't start when the page doesn't say where errors go", () => {
    expect(startErrorTracking(page())).toBe(false)
    expect(startErrorTracking(page('not json'))).toBe(false)
    expect(startErrorTracking(page('{"dsn":""}'))).toBe(false)
    expect(init).not.toHaveBeenCalled()
  })

  it('starts Sentry with the settings from the page', () => {
    const settings = { dsn: 'https://public@o1.ingest.us.sentry.io/2', environment: 'production', release: 'abc123' }
    expect(errorTrackingSettings(page(JSON.stringify(settings)))).toEqual(settings)
    expect(startErrorTracking(page(JSON.stringify(settings)))).toBe(true)
    expect(init).toHaveBeenCalledWith(expect.objectContaining(settings))
  })

  it('never sends the tokens in links from emails', () => {
    startErrorTracking(page('{"dsn":"https://public@o1.ingest.us.sentry.io/2","environment":"production"}'))
    const { beforeSend, beforeBreadcrumb } = init.mock.calls[0][0]
    expect(beforeSend({ request: { url: 'https://casafida.com/reset-password?token=secret' } })).toEqual({
      request: { url: 'https://casafida.com/reset-password' },
    })
    expect(
      beforeBreadcrumb({ category: 'navigation', data: { from: '/invite?token=secret', to: '/projects/3#money' } }),
    ).toEqual({ category: 'navigation', data: { from: '/invite', to: '/projects/3' } })
    expect(withoutQuery('/api/me')).toBe('/api/me')
  })
})
