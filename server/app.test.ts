import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp, pageWithSettings } from './app.ts'

const PAGE = '<!doctype html>\n<html>\n  <head>\n    <title>Casa Fida</title>\n  </head>\n  <body></body>\n</html>\n'
const tracking = {
  dsn: 'https://public@o1.ingest.us.sentry.io/2',
  environment: 'staging',
  release: 'abc123',
  origin: 'https://o1.ingest.us.sentry.io',
}

describe('the built app', () => {
  const distDir = mkdtempSync(join(tmpdir(), 'casa-fida-dist-'))
  writeFileSync(join(distDir, 'index.html'), PAGE)
  afterAll(() => rmSync(distDir, { recursive: true, force: true }))

  it('tells the app where to send errors, and lets it send them there', async () => {
    const app = createApp({ production: true, distDir, errorTracking: tracking })
    const res = await request(app).get('/projects/12')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(res.text).toContain(
      '<meta name="error-tracking" content="{&quot;dsn&quot;:&quot;https://public@o1.ingest.us.sentry.io/2&quot;,&quot;environment&quot;:&quot;staging&quot;,&quot;release&quot;:&quot;abc123&quot;}" />\n  </head>',
    )
    expect(res.headers['content-security-policy']).toContain("connect-src 'self' https://o1.ingest.us.sentry.io")
  })

  it('leaves the page and the security policy as they are when errors aren\'t tracked', async () => {
    const app = createApp({ production: true, distDir, errorTracking: null })
    const res = await request(app).get('/')
    expect(res.text).toBe(PAGE)
    expect(res.headers['content-security-policy']).toMatch(/connect-src 'self'(;|$)/)
  })
})

describe('the page settings', () => {
  it("can't be used to add HTML to the page", () => {
    const page = pageWithSettings(PAGE, { ...tracking, environment: '"><script>alert(1)</script>' })
    expect(page).not.toContain('<script>')
    expect(page).toContain('&quot;&gt;&lt;script&gt;')
  })
})
