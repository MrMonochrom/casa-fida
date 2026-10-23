// Tests for the fixes from the security review: confirming email addresses, keeping a client's
// details from builders they aren't working with, login limits and the other abuse limits.
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, trustProxySetting } from '../app.ts'
import { db } from '../db.ts'
import { subscribe } from '../events.ts'
import { outbox } from '../mailer.ts'
import { limits } from '../rateLimit.ts'
import { PASSWORD, createBuilder, createClient, newAgent, propose, resetDb, signUp, validProposal } from '../test/helpers.ts'

beforeEach(resetDb)

/** The token in the newest email's link of this kind. */
function tokenIn(kind: 'verify-email' | 'invite'): string {
  const match = new RegExp(`/${kind}\\?token=(\\S+)`).exec(outbox.at(-1)?.text ?? '')
  if (!match) throw new Error(`No ${kind} link in the newest email`)
  return decodeURIComponent(match[1])
}

async function signUpUnconfirmed(email: string, role: 'client' | 'builder' = 'client') {
  const agent = newAgent()
  const res = await agent.post('/api/signup').send({ name: 'New Person', email, password: PASSWORD, role })
  expect(res.status).toBe(201)
  return { agent, user: res.body.user, token: tokenIn('verify-email') }
}

describe('confirming an email address', () => {
  it('emails a link on sign-up, without anything the person typed in it', async () => {
    await newAgent()
      .post('/api/signup')
      .send({ name: 'Visit evil.example now', email: 'ana@example.com', password: PASSWORD, role: 'client' })
    const email = outbox.at(-1)!
    expect(email).toMatchObject({ to: 'ana@example.com', subject: 'Confirm your email address for Casa Fida' })
    expect(email.text).toContain('http://localhost:5174/verify-email?token=')
    expect(email.text).not.toContain('evil')
  })

  it('confirms the address with the link, once, without needing to log in', async () => {
    const { agent, token } = await signUpUnconfirmed('ana@example.com')
    expect((await agent.get('/api/me')).body.user.emailVerified).toBe(false)

    const res = await newAgent().post('/api/verify-email').send({ token })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ email: 'ana@example.com' })
    expect((await agent.get('/api/me')).body.user.emailVerified).toBe(true)

    const again = await newAgent().post('/api/verify-email').send({ token })
    expect(again.status).toBe(404)
    expect(again.body.error).toBe('This confirmation link has expired or was already used. Log in to get a new one.')
  })

  it('refuses made-up and expired links', async () => {
    const { token } = await signUpUnconfirmed('ana@example.com')
    expect((await newAgent().post('/api/verify-email').send({ token: 'made-up' })).status).toBe(404)
    expect((await newAgent().post('/api/verify-email').send({})).status).toBe(404)
    await db.query('UPDATE users SET verify_expires_at = NOW() - INTERVAL 1 MINUTE')
    expect((await newAgent().post('/api/verify-email').send({ token })).status).toBe(404)
  })

  it('sends a new link on request, which replaces the old one, a few times an hour', async () => {
    vi.stubEnv('RATE_LIMITS', 'on')
    const { agent, token: first } = await signUpUnconfirmed('ana@example.com')
    expect((await agent.post('/api/me/verify-email')).status).toBe(204)
    const second = tokenIn('verify-email')
    expect(second).not.toBe(first)
    expect((await newAgent().post('/api/verify-email').send({ token: first })).status).toBe(404)
    for (let i = 0; i < 4; i++) expect((await agent.post('/api/me/verify-email')).status).toBe(204)
    expect((await agent.post('/api/me/verify-email')).status).toBe(429)
    vi.unstubAllEnvs()
  })

  it("doesn't resend to a confirmed address", async () => {
    const ana = await createClient()
    const res = await ana.agent.post('/api/me/verify-email')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Your email address is already confirmed.')
  })
})

describe('proposals and confirmed addresses', () => {
  it('needs the builder to have confirmed their own address', async () => {
    const bob = await createBuilder({}, { verified: false })
    const res = await bob.agent.post('/api/projects').send(validProposal('ana@example.com'))
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Confirm your email address before sending proposals. We sent you a link.')
  })

  it('keeps a proposal out of an account that signed up with someone else’s address', async () => {
    // Eve signs up with Ana's address, but can't open Ana's email.
    const eve = await signUpUnconfirmed('ana@example.com')
    const bob = await createBuilder()
    const project = await propose(bob, 'ana@example.com')
    expect(project).toMatchObject({ client: null, invitedClient: { email: 'ana@example.com' } })
    expect((await eve.agent.get('/api/projects')).body.projects).toEqual([])
    expect((await eve.agent.get(`/api/projects/${project.id}`)).status).toBe(404)
    // The email goes to the address with an invite link, for whoever can read it.
    expect(outbox.at(-1)!.text).toContain('/invite?token=')
  })

  it('brings waiting proposals into the account once the address is confirmed', async () => {
    const ana = await signUpUnconfirmed('ana@example.com')
    const bob = await createBuilder()
    const heard = vi.fn()
    const stop = subscribe(bob.user.id, heard)
    const project = await propose(bob, 'ana@example.com')
    const invite = tokenIn('invite')

    await newAgent().post('/api/verify-email').send({ token: ana.token })
    const mine = (await ana.agent.get('/api/projects')).body.projects
    expect(mine.map((p: { id: number }) => p.id)).toEqual([project.id])
    expect(heard).toHaveBeenCalledWith({ type: 'project', projectId: project.id })
    stop()
    // The invite link in the proposal email still opens it.
    expect((await ana.agent.post('/api/invites/claim').send({ token: invite })).body).toEqual({ projectId: project.id })
  })

  it('counts opening the invite from a proposal email to your own address as confirming it', async () => {
    const ana = await signUpUnconfirmed('ana@example.com')
    const bob = await createBuilder()
    const project = await propose(bob, 'ana@example.com')
    const res = await ana.agent.post('/api/invites/claim').send({ token: tokenIn('invite') })
    expect(res.body).toEqual({ projectId: project.id })
    expect((await ana.agent.get('/api/me')).body.user.emailVerified).toBe(true)
  })

  it("doesn't count an invite link the builder asked for, even opened by the address's owner", async () => {
    const ana = await signUpUnconfirmed('ana@example.com')
    const bob = await createBuilder()
    const project = await propose(bob, 'ana@example.com')
    const emailed = tokenIn('invite')
    const link = (await bob.agent.post(`/api/projects/${project.id}/invite-link`)).body.link
    // The emailed link stops working, and the one Bob passes on doesn't confirm anything.
    expect((await ana.agent.post('/api/invites/claim').send({ token: emailed })).status).toBe(404)
    const res = await ana.agent.post('/api/invites/claim').send({ token: new URL(link).searchParams.get('token') })
    expect(res.body).toEqual({ projectId: project.id })
    expect((await ana.agent.get('/api/me')).body.user.emailVerified).toBe(false)
  })

  it("doesn't let a builder confirm someone else's address with an invite link they asked for", async () => {
    // Bob sent Ana a proposal. Mallory has a builder account, and signs up as a client with Ana's address.
    const bob = await createBuilder()
    const waiting = await propose(bob, 'ana@example.com')
    const mallory = await createBuilder()
    const bait = await propose(mallory, 'ana@example.com')
    const link = (await mallory.agent.post(`/api/projects/${bait.id}/invite-link`)).body.link
    const token = new URL(link).searchParams.get('token')
    const fake = await signUpUnconfirmed('ana@example.com')

    expect((await fake.agent.post('/api/invites/claim').send({ token })).body).toEqual({ projectId: bait.id })
    expect((await fake.agent.get('/api/me')).body.user.emailVerified).toBe(false)
    // So Bob's proposal stays out of the account.
    const mine = (await fake.agent.get('/api/projects')).body.projects
    expect(mine.map((p: { id: number }) => p.id)).toEqual([bait.id])
    expect((await fake.agent.get(`/api/projects/${waiting.id}`)).status).toBe(404)
  })

  it("doesn't confirm a different address from someone else's invite", async () => {
    const bob = await createBuilder()
    await propose(bob, 'ana@example.com')
    const token = tokenIn('invite')
    const cat = await signUpUnconfirmed('cat@example.com')
    expect((await cat.agent.post('/api/invites/claim').send({ token })).status).toBe(200)
    expect((await cat.agent.get('/api/me')).body.user.emailVerified).toBe(false)
  })
})

describe("a client's own details", () => {
  it('stay hidden from a builder until the client accepts', async () => {
    const ana = await createClient({ name: 'Ana Lima', email: 'ana@example.com' })
    await ana.agent.put('/api/me').send({ name: 'Ana Lima', phone: '+373 69 123 456' })
    const bob = await createBuilder()
    const project = await propose(bob, 'ana@example.com', { clientName: 'Whoever' })
    expect(project.client).toEqual({ id: ana.user.id, name: 'Whoever', email: 'ana@example.com', phone: null })
    const listed = (await bob.agent.get('/api/projects')).body.projects[0]
    expect(listed.client).toEqual({ id: ana.user.id, name: 'Whoever' })
    // Ana sees herself as she is.
    expect((await ana.agent.get(`/api/projects/${project.id}`)).body.project.client.name).toBe('Ana Lima')

    await ana.agent.post(`/api/projects/${project.id}/accept`)
    const accepted = (await bob.agent.get(`/api/projects/${project.id}`)).body.project
    expect(accepted.client).toEqual({ id: ana.user.id, name: 'Ana Lima', email: 'ana@example.com', phone: '+373 69 123 456' })
  })

  it("stay out of the answer when the builder asks for an invite link for a proposal that's in the account", async () => {
    await createClient({ name: 'Ana Lima', email: 'ana@example.com' })
    const bob = await createBuilder()
    const project = await propose(bob, 'ana@example.com', { clientName: 'Whoever' })
    const res = await bob.agent.post(`/api/projects/${project.id}/invite-link`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Whoever already has this proposal in their account.')
  })

  it('stay hidden after the client declines', async () => {
    const ana = await createClient({ name: 'Ana Lima', email: 'ana@example.com' })
    const bob = await createBuilder()
    const project = await propose(bob, 'ana@example.com', { clientName: 'Whoever' })
    await ana.agent.post(`/api/projects/${project.id}/decline`)
    expect((await bob.agent.get(`/api/projects/${project.id}`)).body.project.client.name).toBe('Whoever')
  })

  it("don't include messaging: a proposal alone doesn't let a builder start a conversation", async () => {
    const ana = await createClient({ email: 'ana@example.com' })
    const bob = await createBuilder()
    const project = await propose(bob, 'ana@example.com')
    expect((await bob.agent.post('/api/conversations').send({ userId: ana.user.id })).status).toBe(403)
    await ana.agent.post(`/api/projects/${project.id}/accept`)
    expect((await bob.agent.post('/api/conversations').send({ userId: ana.user.id })).status).toBe(200)
  })
})

describe('names every object has', () => {
  it("aren't trades or start times", async () => {
    const bob = await createBuilder()
    for (const trade of ['constructor', 'toString', '__proto__']) {
      const res = await bob.agent
        .put('/api/me/builder-profile')
        .send({ businessName: 'B', about: 'A', serviceArea: 'X', trades: [trade], insured: false })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Choose between 1 and 6 trades.')
    }
    const ana = await createClient()
    const job = { title: 'T', description: 'D', trade: 'kitchens', location: 'L' }
    expect((await ana.agent.post('/api/jobs').send({ ...job, timing: '__proto__' })).body.error).toBe(
      'Choose when you would like the work to start.',
    )
    expect((await ana.agent.post('/api/jobs').send({ ...job, trade: 'constructor' })).body.error).toBe(
      'Choose the kind of work.',
    )
  })
})

describe('login limits', () => {
  // An app that reads the visitor's address from X-Forwarded-For, as behind a proxy.
  function behindProxy() {
    vi.stubEnv('TRUST_PROXY', '1')
    const app = createApp()
    return (ip: string, body: object) => request(app).post('/api/login').set('X-Forwarded-For', ip).send(body)
  }

  it("don't let someone guessing from one address lock the owner out", async () => {
    vi.stubEnv('RATE_LIMITS', 'on')
    const login = behindProxy()
    await createClient({ email: 'ana@example.com' })
    for (let i = 0; i < 5; i++) await login('203.0.113.9', { email: 'ana@example.com', password: 'guess-guess' })
    expect((await login('203.0.113.9', { email: 'ana@example.com', password: PASSWORD })).status).toBe(429)
    expect((await login('198.51.100.7', { email: 'ana@example.com', password: PASSWORD })).status).toBe(200)
    vi.unstubAllEnvs()
  })

  it('still stop guessing spread over many addresses', async () => {
    vi.stubEnv('RATE_LIMITS', 'on')
    const login = behindProxy()
    await createClient({ email: 'ana@example.com' })
    for (let i = 0; i < 30; i++) await login(`203.0.113.${i}`, { email: 'ana@example.com', password: 'guess-guess' })
    expect((await login('198.51.100.7', { email: 'ana@example.com', password: PASSWORD })).status).toBe(429)
    vi.unstubAllEnvs()
  })
})

describe('other limits', () => {
  it('stop a builder sending more than 50 proposals in a day', async () => {
    vi.stubEnv('RATE_LIMITS', 'on')
    const bob = await createBuilder()
    for (let i = 0; i < 50; i++) limits.invitesPerBuilderPerDay.hit(String(bob.user.id))
    expect((await bob.agent.post('/api/projects').send(validProposal('ana@example.com'))).status).toBe(429)
    vi.unstubAllEnvs()
  })

  it('treat TRUST_PROXY=true as one proxy, so visitors can’t make up their address', () => {
    expect(trustProxySetting('true')).toBe(1)
    expect(trustProxySetting('2')).toBe(2)
    expect(trustProxySetting('false')).toBe(false)
    expect(trustProxySetting(undefined)).toBe(false)
    expect(trustProxySetting('loopback')).toBe('loopback')
  })

  it('give each test account a confirmed address unless asked not to', async () => {
    expect((await (await signUp()).agent.get('/api/me')).body.user.emailVerified).toBe(true)
    expect((await (await signUp({ verified: false })).agent.get('/api/me')).body.user.emailVerified).toBe(false)
  })
})
