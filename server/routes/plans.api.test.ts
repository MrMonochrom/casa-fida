import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db.ts'
import { outbox } from '../mailer.ts'
import { notificationsSent, sendJobDigests } from '../notifications.ts'
import { limits } from '../rateLimit.ts'
import { createBuilder, createClient, newAgent, postJob, resetDb, validBuilderProfile, validJob } from '../test/helpers.ts'
import type { Person } from '../test/helpers.ts'

beforeEach(resetDb)

const goPro = (person: Person, endsSql = 'NULL') =>
  db.execute(`UPDATE users SET plan = 'pro', plan_ends_at = ${endsSql} WHERE id = ?`, [person.user.id])

async function emailsTo(person: Person) {
  await notificationsSent()
  return outbox.filter((e) => e.to === person.email)
}

const TRADES = ['new_homes', 'extensions', 'renovations', 'kitchens', 'bathrooms', 'roofing', 'basements_attics',
  'decks_landscaping', 'electrical', 'plumbing', 'painting', 'carpentry', 'flooring']

describe('plans', () => {
  it('start every builder on the free plan, with a trial to try; clients have none', async () => {
    const bob = await createBuilder()
    expect((await bob.agent.get('/api/me')).body.user.plan).toEqual({ name: 'free', endsAt: null, trialAvailable: true })
    const ana = await createClient()
    expect((await ana.agent.get('/api/me')).body.user.plan).toBeNull()
    expect((await ana.agent.post('/api/me/plan/trial')).status).toBe(403)
  })

  it('give one 14-day trial of Pro, then go back to free', async () => {
    const bob = await createBuilder()
    const before = Date.now()
    const res = await bob.agent.post('/api/me/plan/trial')
    expect(res.status).toBe(200)
    const { plan } = res.body.user
    expect(plan).toMatchObject({ name: 'pro', trialAvailable: false })
    const days = (plan.endsAt - before) / 86_400_000
    expect(days).toBeGreaterThan(13.9)
    expect(days).toBeLessThan(14.1)

    const again = await bob.agent.post('/api/me/plan/trial')
    expect(again.status).toBe(409)
    expect(again.body.error).toBe("You're already on Pro.")

    await db.execute('UPDATE users SET plan_ends_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [bob.user.id])
    expect((await bob.agent.get('/api/me')).body.user.plan).toEqual({ name: 'free', endsAt: null, trialAvailable: false })
    const afterwards = await bob.agent.post('/api/me/plan/trial')
    expect(afterwards.status).toBe(409)
    expect(afterwards.body.error).toBe("You've already used your free trial of Pro.")
  })

  it('let builders offer 6 trades on Free and 12 on Pro', async () => {
    const bob = await createBuilder()
    const save = (count: number) =>
      bob.agent.put('/api/me/builder-profile').send(validBuilderProfile({ trades: TRADES.slice(0, count) }))
    expect((await save(6)).status).toBe(200)
    expect((await save(7)).body.error).toBe('Choose between 1 and 6 trades.')
    await goPro(bob)
    expect((await save(12)).status).toBe(200)
    expect((await save(13)).body.error).toBe('Choose between 1 and 12 trades.')
  })

  it('allow 30 new quotes a day on Free and 100 on Pro', async () => {
    vi.stubEnv('RATE_LIMITS', 'on')
    const ana = await createClient()
    const job = await postJob(ana)
    const bob = await createBuilder()
    const quote = () => bob.agent.put(`/api/jobs/${job.id}/quote`).send({ amount: 100, message: 'Hi.' })
    for (let i = 0; i < 30; i++) limits.newQuotesPerBuilderPerDay.hit(String(bob.user.id))
    expect((await quote()).status).toBe(429)

    await goPro(bob)
    expect((await quote()).status).toBe(201)
    await bob.agent.delete(`/api/jobs/${job.id}/quote`)
    for (let i = 0; i < 99; i++) limits.newQuotesPerProBuilderPerDay.hit(String(bob.user.id))
    expect((await quote()).status).toBe(429)
    vi.unstubAllEnvs()
  })
})

describe('new job emails', () => {
  it('reach builders on Pro the moment a job is posted in their trades', async () => {
    const ana = await createClient()
    const pro = await createBuilder({ trades: ['kitchens'] })
    const proElsewhere = await createBuilder({ trades: ['roofing'] })
    const free = await createBuilder({ trades: ['kitchens'] })
    await goPro(pro)
    await goPro(proElsewhere)

    const job = await postJob(ana, { title: 'New kitchen', trade: 'kitchens', location: 'Chișinău' })
    const [email] = await emailsTo(pro)
    expect(email.subject).toBe('New job: New kitchen')
    expect(email.text).toContain('A client posted a job in your trades: “New kitchen”, in Chișinău.')
    expect(email.text).toContain(`/jobs/${job.id}`)
    expect(await emailsTo(proElsewhere)).toHaveLength(0)
    expect(await emailsTo(free)).toHaveLength(0)
  })

  it('skip Pro builders who turned them off, or whose Pro has ended', async () => {
    const ana = await createClient()
    const off = await createBuilder({ trades: ['kitchens'] })
    const ended = await createBuilder({ trades: ['kitchens'] })
    await goPro(off)
    await off.agent.put('/api/me/notifications').send({ jobs: false })
    await goPro(ended, 'NOW() - INTERVAL 1 DAY')
    await postJob(ana, { trade: 'kitchens' })
    expect(await emailsTo(off)).toHaveLength(0)
    expect(await emailsTo(ended)).toHaveLength(0)
  })

  it('come once a day on Free, listing what was posted since the last one', async () => {
    const ana = await createClient()
    const bob = await createBuilder({ trades: ['kitchens'] })
    await postJob(ana, { title: 'Kitchen A', trade: 'kitchens', location: 'Bălți' })
    await postJob(ana, { title: 'Roof B', trade: 'roofing' })
    await sendJobDigests()
    const [first] = await emailsTo(bob)
    expect(first.subject).toBe('1 new job in your trades')
    expect(first.text).toContain('• Kitchen A · Bălți')
    expect(first.text).not.toContain('Roof B')
    expect(first.text).toContain("With Pro, you hear about each job the moment it's posted.")

    // Not again the same day, even with something new.
    await postJob(ana, { title: 'Kitchen C', trade: 'kitchens' })
    await sendJobDigests()
    expect(await emailsTo(bob)).toHaveLength(1)

    // A day later, only what's new since: Kitchen C was posted the same second the first email went.
    await db.execute('UPDATE users SET jobs_digest_sent_at = jobs_digest_sent_at - INTERVAL 1 DAY WHERE id = ?', [bob.user.id])
    await sendJobDigests()
    const second = (await emailsTo(bob)).at(-1)!
    expect(second.text).toContain('• Kitchen C')
    expect(second.text).not.toContain('Kitchen A')
  })

  it('list ten jobs by name and count the rest, and skip days with nothing new', async () => {
    const ana = await createClient()
    const bob = await createBuilder({ trades: ['kitchens'] })
    await sendJobDigests()
    expect(await emailsTo(bob)).toHaveLength(0)
    for (let i = 1; i <= 12; i++) await postJob(ana, { title: `Kitchen ${i}`, trade: 'kitchens' })
    await sendJobDigests()
    const [email] = await emailsTo(bob)
    expect(email.subject).toBe('12 new jobs in your trades')
    expect(email.text.match(/^• /gm)).toHaveLength(10)
    expect(email.text).toContain('…and 2 more.')
  })

  it("leave builders on Pro out of the daily email, since they've heard already", async () => {
    const ana = await createClient()
    const pro = await createBuilder({ trades: ['kitchens'] })
    await goPro(pro)
    await postJob(ana, { trade: 'kitchens' })
    await notificationsSent()
    outbox.length = 0
    await sendJobDigests()
    expect(await emailsTo(pro)).toHaveLength(0)
  })

  it('wait until the client has confirmed their address, then go out', async () => {
    const ana = await createClient({ verified: false })
    const pro = await createBuilder({ trades: ['kitchens'] })
    await goPro(pro)
    const job = await postJob(ana, { title: 'New kitchen', trade: 'kitchens' })
    expect(await emailsTo(pro)).toHaveLength(0)

    await ana.agent.post('/api/me/verify-email')
    const token = decodeURIComponent(/\/verify-email\?token=(\S+)/.exec(outbox.at(-1)!.text)![1])
    await newAgent().post('/api/verify-email').send({ token })
    const [email] = await emailsTo(pro)
    expect(email.subject).toBe('New job: New kitchen')
    expect(email.text).toContain(`/jobs/${job.id}`)
  })

  it("leave jobs from clients who haven't confirmed their address out of the daily email", async () => {
    const ana = await createClient()
    const eve = await createClient({ verified: false })
    const bob = await createBuilder({ trades: ['kitchens'] })
    await postJob(ana, { title: 'Real kitchen', trade: 'kitchens' })
    await postJob(eve, { title: 'Visit evil.example', trade: 'kitchens' })
    await sendJobDigests()
    const [email] = await emailsTo(bob)
    expect(email.text).toContain('• Real kitchen')
    expect(email.text).not.toContain('evil.example')
  })

  it('stop a client at 5 new jobs a day', async () => {
    vi.stubEnv('RATE_LIMITS', 'on')
    const ana = await createClient()
    for (let i = 0; i < 5; i++) expect((await ana.agent.post('/api/jobs').send(validJob())).status).toBe(201)
    expect((await ana.agent.post('/api/jobs').send(validJob())).status).toBe(429)
    vi.unstubAllEnvs()
  })
})

describe('trades after Pro ends', () => {
  it('count only the first six chosen, until the builder picks which to keep', async () => {
    const twelve = ['carpentry', 'new_homes', 'extensions', 'renovations', 'kitchens', 'bathrooms',
      'roofing', 'basements_attics', 'decks_landscaping', 'electrical', 'plumbing', 'painting']
    const bob = await createBuilder()
    await bob.agent.post('/api/me/plan/trial')
    expect((await bob.agent.put('/api/me/builder-profile').send(validBuilderProfile({ trades: twelve }))).status).toBe(200)
    await db.execute('UPDATE users SET plan_ends_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [bob.user.id])

    // The profile keeps all twelve, in the order chosen, so the builder can see which still count.
    expect((await bob.agent.get('/api/me')).body.user.builderProfile.trades).toEqual(twelve)

    // Everywhere else, only the first six: carpentry (chosen first) counts, roofing (seventh) doesn't.
    const ana = await createClient()
    const found = async (trade: string) =>
      (await ana.agent.get(`/api/builders?trade=${trade}`)).body.builders.map((b: { id: number }) => b.id)
    expect(await found('carpentry')).toEqual([bob.user.id])
    expect(await found('roofing')).toEqual([])
    expect((await ana.agent.get(`/api/builders/${bob.user.id}`)).body.builder.trades).toEqual(twelve.slice(0, 6).sort())

    await postJob(ana, { title: 'Shelves', trade: 'carpentry' })
    await postJob(ana, { title: 'New roof', trade: 'roofing' })
    const listed = (await bob.agent.get('/api/jobs?trade=mine')).body.jobs.map((j: { title: string }) => j.title)
    expect(listed).toEqual(['Shelves'])
    expect((await bob.agent.get('/api/summary')).body.jobs).toBe(1)
    await sendJobDigests()
    const [email] = await emailsTo(bob)
    expect(email.text).toContain('• Shelves')
    expect(email.text).not.toContain('New roof')

    // Keeping the other six makes those the ones that count.
    expect((await bob.agent.put('/api/me/builder-profile').send(validBuilderProfile({ trades: twelve.slice(6) }))).status).toBe(200)
    expect(await found('roofing')).toEqual([bob.user.id])
    expect(await found('carpentry')).toEqual([])
  })
})

describe('npm run plan', () => {
  const run = (...args: string[]) => promisify(execFile)('node', ['server/scripts/set-plan.ts', ...args], { env: process.env })

  it('puts a builder on a plan by hand', async () => {
    const bob = await createBuilder({}, { email: 'bob@example.com' })
    const { stdout } = await run('bob@example.com', 'pro', '30')
    expect(stdout).toContain('bob@example.com is now on pro for 30 days.')
    expect((await bob.agent.get('/api/me')).body.user.plan.name).toBe('pro')
    await run('bob@example.com', 'free')
    expect((await bob.agent.get('/api/me')).body.user.plan.name).toBe('free')
    expect((await run('nobody@example.com', 'pro')).stdout).toContain('No builder account uses nobody@example.com.')
  })
})
