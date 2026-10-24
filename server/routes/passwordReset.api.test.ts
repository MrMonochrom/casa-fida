import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db.ts'
import { outbox } from '../mailer.ts'
import { PASSWORD, createClient, newAgent, resetDb, signUp } from '../test/helpers.ts'

beforeEach(resetDb)

const ask = (email: string, cookie = '') => newAgent().post('/api/password-reset').set('Cookie', cookie).send({ email })

/** The token in the newest reset email. */
function resetToken(): string {
  const match = /\/reset-password\?token=(\S+)/.exec(outbox.at(-1)?.text ?? '')
  if (!match) throw new Error('No reset link in the newest email')
  return decodeURIComponent(match[1])
}

describe('POST /api/password-reset', () => {
  it('emails a link to an address with an account', async () => {
    await createClient({ email: 'ana@example.com' })
    expect((await ask('ANA@example.com')).status).toBe(204)
    expect(outbox.at(-1)).toMatchObject({ to: 'ana@example.com', subject: 'Reset your Casa Fida password' })
    expect(outbox.at(-1)!.text).toContain('http://localhost:5174/reset-password?token=')
    const [rows] = await db.query('SELECT reset_token_hash FROM users')
    expect((rows as { reset_token_hash: string }[])[0].reset_token_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("answers the same for an address without one, so it can't tell who has an account", async () => {
    const res = await ask('nobody@example.com')
    expect(res.status).toBe(204)
    expect(outbox).toHaveLength(0)
  })

  it('needs a valid email address', async () => {
    expect((await ask('not-an-email')).body.error).toBe('Please enter a valid email address.')
  })

  it('writes the email in the language the app is in', async () => {
    await createClient({ email: 'ana@example.com' })
    await ask('ana@example.com', 'cf_lang=ru')
    expect(outbox.at(-1)!.subject).toBe('Сброс пароля Casa Fida')
  })

  it('sends a few an hour to one address', async () => {
    vi.stubEnv('RATE_LIMITS', 'on')
    await createClient({ email: 'ana@example.com' })
    for (let i = 0; i < 3; i++) expect((await ask('ana@example.com')).status).toBe(204)
    expect((await ask('ana@example.com')).status).toBe(429)
    vi.unstubAllEnvs()
  })
})

describe('POST /api/password-reset/confirm', () => {
  it('sets the new password, logs in here and out everywhere else', async () => {
    const ana = await createClient({ email: 'ana@example.com' })
    await ask('ana@example.com')
    const agent = newAgent()
    const res = await agent.post('/api/password-reset/confirm').send({ token: resetToken(), password: 'brand-new-pass' })
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('ana@example.com')
    expect((await agent.get('/api/me')).body.user.id).toBe(ana.user.id)
    // The browser that was logged in before is logged out.
    expect((await ana.agent.get('/api/me')).body.user).toBeNull()

    expect((await newAgent().post('/api/login').send({ email: 'ana@example.com', password: PASSWORD })).status).toBe(401)
    expect((await newAgent().post('/api/login').send({ email: 'ana@example.com', password: 'brand-new-pass' })).status).toBe(200)
  })

  it('works once', async () => {
    await createClient({ email: 'ana@example.com' })
    await ask('ana@example.com')
    const token = resetToken()
    await newAgent().post('/api/password-reset/confirm').send({ token, password: 'brand-new-pass' })
    const again = await newAgent().post('/api/password-reset/confirm').send({ token, password: 'another-one-1' })
    expect(again.status).toBe(404)
    expect(again.body.error).toBe('This password reset link has expired or was already used. Ask for a new one.')
  })

  it('stops working after an hour, or when a newer link is sent', async () => {
    await createClient({ email: 'ana@example.com' })
    await ask('ana@example.com')
    const first = resetToken()
    await ask('ana@example.com')
    expect((await newAgent().post('/api/password-reset/confirm').send({ token: first, password: 'brand-new-pass' })).status).toBe(404)
    await db.query('UPDATE users SET reset_expires_at = NOW() - INTERVAL 1 MINUTE')
    expect((await newAgent().post('/api/password-reset/confirm').send({ token: resetToken(), password: 'brand-new-pass' })).status).toBe(404)
  })

  it('checks the new password, and the link still works after a bad one', async () => {
    await createClient({ email: 'ana@example.com' })
    await ask('ana@example.com')
    const token = resetToken()
    const short = await newAgent().post('/api/password-reset/confirm').send({ token, password: 'short' })
    expect(short.body.error).toBe('Your password needs at least 8 characters.')
    expect((await newAgent().post('/api/password-reset/confirm').send({ token, password: 'long-enough-1' })).status).toBe(200)
  })

  it('confirms the email address, since the link was opened from it', async () => {
    await signUp({ email: 'ana@example.com', verified: false })
    await ask('ana@example.com')
    const res = await newAgent().post('/api/password-reset/confirm').send({ token: resetToken(), password: 'brand-new-pass' })
    expect(res.body.user.emailVerified).toBe(true)
  })

  it("is cancelled by changing the password in Account", async () => {
    const ana = await createClient({ email: 'ana@example.com' })
    await ask('ana@example.com')
    const token = resetToken()
    await ana.agent.put('/api/me/password').send({ currentPassword: PASSWORD, newPassword: 'changed-it-myself' })
    expect((await newAgent().post('/api/password-reset/confirm').send({ token, password: 'brand-new-pass' })).status).toBe(404)
  })
})
