import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db.ts'
import { PASSWORD, createBuilder, createClient, newAgent, resetDb, signUp } from '../test/helpers.ts'

beforeEach(resetDb)

const signup = (body: Record<string, unknown>) =>
  newAgent()
    .post('/api/signup')
    .send({ name: 'Ana', email: 'ana@example.com', password: PASSWORD, role: 'client', ...body })

describe('POST /api/signup', () => {
  it('creates a client account and logs in', async () => {
    const agent = newAgent()
    const res = await agent.post('/api/signup').send({ name: ' Ana ', email: 'ANA@Example.com ', password: PASSWORD, role: 'client' })
    expect(res.status).toBe(201)
    expect(res.body.user).toEqual({
      id: expect.any(Number),
      email: 'ana@example.com',
      name: 'Ana',
      role: 'client',
      phone: null,
      memberSince: expect.any(Number),
      builderProfile: null,
    })
    expect(res.headers['set-cookie'][0]).toMatch(/^cf_session=.+HttpOnly/)
    expect((await agent.get('/api/me')).body.user.email).toBe('ana@example.com')
  })

  it('creates a builder account without a business profile yet', async () => {
    const res = await signup({ role: 'builder' })
    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ role: 'builder', builderProfile: null })
  })

  it('never stores the password itself', async () => {
    await signup({})
    const [rows] = await db.query('SELECT password_hash FROM users')
    expect((rows as { password_hash: string }[])[0].password_hash).toMatch(/^scrypt\$/)
  })

  it.each([
    [{ role: 'admin' }, 'Choose whether you are a client or a builder.'],
    [{ role: undefined }, 'Choose whether you are a client or a builder.'],
    [{ name: '  ' }, 'Please enter your name.'],
    [{ name: 'x'.repeat(101) }, 'Please enter your name.'],
    [{ email: 'not-an-email' }, 'Please enter a valid email address.'],
    [{ password: 'short' }, 'Your password needs at least 8 characters.'],
    [{ password: 'x'.repeat(201) }, 'Your password is too long.'],
  ])('refuses %j', async (body, error) => {
    const res = await signup(body)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error })
  })

  it('refuses an email that already has an account', async () => {
    await signup({})
    const res = await signup({ email: 'Ana@example.com' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('An account with this email already exists. Try logging in.')
  })

  it('limits sign-ups from one address', async () => {
    vi.stubEnv('RATE_LIMITS', 'on')
    for (let i = 0; i < 10; i++) expect((await signup({ email: `p${i}@example.com` })).status).toBe(201)
    const res = await signup({ email: 'one-more@example.com' })
    expect(res.status).toBe(429)
    vi.unstubAllEnvs()
  })
})

describe('POST /api/login', () => {
  it('logs in with the right password', async () => {
    const ana = await createClient({ email: 'ana@example.com' })
    const agent = newAgent()
    const res = await agent.post('/api/login').send({ email: 'ANA@example.com', password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(ana.user.id)
    expect((await agent.get('/api/me')).body.user.id).toBe(ana.user.id)
  })

  it('includes a builder their business profile', async () => {
    const bob = await createBuilder({ businessName: 'Bob Builds' })
    const res = await newAgent().post('/api/login').send({ email: bob.email, password: PASSWORD })
    expect(res.body.user.builderProfile).toMatchObject({ businessName: 'Bob Builds', trades: ['extensions', 'kitchens'] })
  })

  it('says the same thing for a wrong password and an unknown email', async () => {
    await createClient({ email: 'ana@example.com' })
    for (const body of [
      { email: 'ana@example.com', password: 'wrong-password' },
      { email: 'nobody@example.com', password: PASSWORD },
      {},
    ]) {
      const res = await newAgent().post('/api/login').send(body)
      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Wrong email or password.')
    }
  })

  it('slows down password guessing for one account', async () => {
    vi.stubEnv('RATE_LIMITS', 'on')
    await createClient({ email: 'ana@example.com' })
    for (let i = 0; i < 5; i++) await newAgent().post('/api/login').send({ email: 'ana@example.com', password: 'nope-nope' })
    const res = await newAgent().post('/api/login').send({ email: 'ana@example.com', password: PASSWORD })
    expect(res.status).toBe(429)
    expect(res.headers['retry-after']).toBeDefined()
    vi.unstubAllEnvs()
  })
})

describe('GET /api/me and POST /api/logout', () => {
  it('is empty when logged out', async () => {
    expect((await newAgent().get('/api/me')).body).toEqual({ user: null })
  })

  it('ignores a damaged or unknown cookie', async () => {
    expect((await newAgent().get('/api/me').set('Cookie', 'cf_session=%E0%A4%A')).body).toEqual({ user: null })
    expect((await newAgent().get('/api/me').set('Cookie', 'other=1; cf_session=made-up')).body).toEqual({ user: null })
  })

  it('logs out and forgets the session', async () => {
    const ana = await createClient()
    expect((await ana.agent.post('/api/logout')).status).toBe(204)
    expect((await ana.agent.get('/api/me')).body).toEqual({ user: null })
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM sessions')
    expect((rows as { n: number }[])[0].n).toBe(0)
  })

  it('treats an expired session as logged out', async () => {
    const ana = await createClient()
    await db.query('UPDATE sessions SET expires_at = NOW() - INTERVAL 1 MINUTE')
    expect((await ana.agent.get('/api/me')).body).toEqual({ user: null })
    expect((await ana.agent.get('/api/projects')).status).toBe(401)
  })
})

describe('PUT /api/me', () => {
  it('changes your name and phone number', async () => {
    const ana = await createClient()
    const res = await ana.agent.put('/api/me').send({ name: 'Ana Lima', phone: '(303) 555-0100' })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ name: 'Ana Lima', phone: '(303) 555-0100' })
    const cleared = await ana.agent.put('/api/me').send({ name: 'Ana Lima', phone: '' })
    expect(cleared.body.user.phone).toBeNull()
  })

  it.each([
    [{ name: '' }, 'Please enter your name.'],
    [{ name: 'Ana', phone: 'call me maybe' }, 'Please enter a valid phone number, or leave it empty.'],
    [{ name: 'Ana', phone: '1'.repeat(41) }, 'Please enter a valid phone number, or leave it empty.'],
  ])('refuses %j', async (body, error) => {
    const ana = await createClient()
    const res = await ana.agent.put('/api/me').send(body)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it('needs you to be logged in', async () => {
    expect((await newAgent().put('/api/me').send({ name: 'X' })).status).toBe(401)
  })
})

describe('PUT /api/me/password', () => {
  it('changes the password and logs out other browsers', async () => {
    const ana = await signUp()
    const otherBrowser = newAgent()
    await otherBrowser.post('/api/login').send({ email: ana.email, password: PASSWORD })

    const res = await ana.agent.put('/api/me/password').send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass' })
    expect(res.status).toBe(204)
    expect((await ana.agent.get('/api/me')).body.user).not.toBeNull()
    expect((await otherBrowser.get('/api/me')).body.user).toBeNull()
    expect((await newAgent().post('/api/login').send({ email: ana.email, password: 'brand-new-pass' })).status).toBe(200)
  })

  it('needs the current password', async () => {
    const ana = await signUp()
    const res = await ana.agent.put('/api/me/password').send({ currentPassword: 'wrong-one', newPassword: 'brand-new-pass' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Your current password is wrong.')
  })

  it('checks the new password', async () => {
    const ana = await signUp()
    const res = await ana.agent.put('/api/me/password').send({ currentPassword: PASSWORD, newPassword: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Your password needs at least 8 characters.')
  })
})
