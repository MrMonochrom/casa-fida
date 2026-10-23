import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db.ts'
import { subscribe } from '../events.ts'
import {
  breakDatabase,
  createBuilder,
  createClient,
  newAgent,
  postJob,
  resetDb,
  sendQuote,
  signUp,
  validJob,
} from '../test/helpers.ts'

beforeEach(resetDb)

describe('POST /api/jobs', () => {
  it('posts a job', async () => {
    const ana = await createClient({ name: 'Ana Lima' })
    const res = await ana.agent.post('/api/jobs').send(validJob({ description: 'Line one\r\nLine two' }))
    expect(res.status).toBe(201)
    expect(res.body.job).toEqual({
      id: expect.any(Number),
      title: 'New kitchen',
      description: 'Line one\nLine two',
      trade: 'kitchens',
      location: 'Denver, CO',
      budgetMin: 2_000_000,
      budgetMax: 3_000_000,
      timing: 'within_3_months',
      status: 'open',
      createdAt: expect.any(Number),
      client: { id: ana.user.id, name: 'Ana Lima' },
      quoteCount: 0,
      pendingQuotes: 0,
      projectId: null,
    })
  })

  it('works without a budget, and assumes flexible timing', async () => {
    const ana = await createClient()
    const res = await ana.agent.post('/api/jobs').send(validJob({ budgetMin: null, budgetMax: undefined, timing: undefined }))
    expect(res.body.job).toMatchObject({ budgetMin: null, budgetMax: null, timing: 'flexible' })
  })

  it.each([
    [{ title: '' }, 'Give the job a short title.'],
    [{ title: 'x'.repeat(121) }, 'Give the job a short title.'],
    [{ description: '' }, 'Describe the work you need done.'],
    [{ description: 'x'.repeat(4001) }, 'Keep the description under 4,000 characters.'],
    [{ trade: 'juggling' }, 'Choose the kind of work.'],
    [{ location: '' }, 'Where is the job? A town or neighborhood is enough.'],
    [{ timing: 'yesterday' }, 'Choose when you would like the work to start.'],
    [{ budgetMin: -5 }, 'The budget should be an amount above zero.'],
    [{ budgetMax: 'lots' }, 'The budget should be an amount above zero.'],
    [{ budgetMax: 12.5 }, 'The budget should be an amount above zero.'],
    [{ budgetMin: 500, budgetMax: 100 }, "The budget's lowest amount is more than its highest."],
  ])('refuses %j', async (overrides, error) => {
    const ana = await createClient()
    const res = await ana.agent.post('/api/jobs').send(validJob(overrides))
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it('is only for clients', async () => {
    const bob = await createBuilder()
    expect((await bob.agent.post('/api/jobs').send(validJob())).status).toBe(403)
  })
})

describe('GET /api/jobs/mine', () => {
  it('lists your jobs, newest first, with how many quotes are waiting', async () => {
    const ana = await createClient()
    const older = await postJob(ana, { title: 'Older' })
    await db.query('UPDATE jobs SET created_at = NOW() - INTERVAL 1 DAY WHERE id = ?', [older.id])
    await postJob(ana, { title: 'Newer' })
    await postJob(await createClient(), { title: 'Not mine' })
    const bob = await createBuilder()
    const cat = await createBuilder()
    await sendQuote(bob, older.id)
    await sendQuote(cat, older.id)
    await cat.agent.delete(`/api/jobs/${older.id}/quote`)

    const { jobs } = (await ana.agent.get('/api/jobs/mine')).body
    expect(jobs.map((j: { title: string }) => j.title)).toEqual(['Newer', 'Older'])
    expect(jobs[1]).toMatchObject({ quoteCount: 1, pendingQuotes: 1 })
  })
})

describe('PUT /api/jobs/:id', () => {
  it('changes an open job and tells the builders who quoted', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const bob = await createBuilder()
    await sendQuote(bob, job.id)
    const heard = vi.fn()
    const stop = subscribe(bob.user.id, heard)

    const res = await ana.agent.put(`/api/jobs/${job.id}`).send(validJob({ title: 'Bigger kitchen' }))
    expect(res.status).toBe(200)
    expect(res.body.job.title).toBe('Bigger kitchen')
    expect(heard).toHaveBeenCalledWith({ type: 'job', jobId: job.id })
    stop()
  })

  it("can't change a closed job, or someone else's", async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const eve = await createClient()
    expect((await eve.agent.put(`/api/jobs/${job.id}`).send(validJob())).status).toBe(404)
    expect((await ana.agent.put(`/api/jobs/${job.id}`).send(validJob({ title: '' }))).status).toBe(400)
    await ana.agent.post(`/api/jobs/${job.id}/close`)
    const res = await ana.agent.put(`/api/jobs/${job.id}`).send(validJob())
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Only open jobs can be changed.')
  })
})

describe('POST /api/jobs/:id/close', () => {
  it('closes the job and declines the quotes waiting for an answer', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const bob = await createBuilder()
    await sendQuote(bob, job.id)

    const res = await ana.agent.post(`/api/jobs/${job.id}/close`)
    expect(res.status).toBe(200)
    expect(res.body.job).toMatchObject({ status: 'closed', pendingQuotes: 0 })
    const { quotes } = (await bob.agent.get('/api/quotes/mine')).body
    expect(quotes[0].status).toBe('declined')
    expect((await ana.agent.post(`/api/jobs/${job.id}/close`)).status).toBe(409)
  })

  it("can't close someone else's job", async () => {
    const job = await postJob(await createClient())
    const eve = await createClient()
    const res = await eve.agent.post(`/api/jobs/${job.id}/close`)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("This job doesn't exist.")
  })
})

describe('GET /api/jobs (builders)', () => {
  it('lists open jobs, newest first, with your quote on each', async () => {
    const ana = await createClient({ name: 'Ana Lima' })
    const kitchen = await postJob(ana, { title: 'Kitchen' })
    await db.query('UPDATE jobs SET created_at = NOW() - INTERVAL 1 HOUR WHERE id = ?', [kitchen.id])
    await postJob(ana, { title: 'Roof', trade: 'roofing' })
    const closed = await postJob(ana, { title: 'Closed' })
    await ana.agent.post(`/api/jobs/${closed.id}/close`)
    const bob = await createBuilder()
    const quote = await sendQuote(bob, kitchen.id, { amount: 1_234_500 })

    const { jobs } = (await bob.agent.get('/api/jobs')).body
    expect(jobs.map((j: { title: string }) => j.title)).toEqual(['Roof', 'Kitchen'])
    expect(jobs[1]).toMatchObject({
      client: { id: ana.user.id, name: 'Ana L.' },
      quoteCount: 1,
      myQuote: { id: quote.id, amount: 1_234_500, status: 'pending' },
    })
    expect(jobs[1].pendingQuotes).toBeUndefined()
    expect(jobs[0].myQuote).toBeNull()
  })

  it('filters by one trade, or by the trades you offer', async () => {
    const ana = await createClient()
    await postJob(ana, { title: 'Kitchen', trade: 'kitchens' })
    await postJob(ana, { title: 'Roof', trade: 'roofing' })
    await postJob(ana, { title: 'Paint', trade: 'painting' })
    const bob = await createBuilder({ trades: ['kitchens', 'painting'] })
    const titles = async (trade: string) =>
      (await bob.agent.get('/api/jobs').query({ trade })).body.jobs.map((j: { title: string }) => j.title).sort()
    expect(await titles('roofing')).toEqual(['Roof'])
    expect(await titles('mine')).toEqual(['Kitchen', 'Paint'])
    expect((await bob.agent.get('/api/jobs?trade=juggling')).status).toBe(400)
  })

  it('is only for builders', async () => {
    const ana = await createClient()
    expect((await ana.agent.get('/api/jobs')).status).toBe(403)
  })
})

describe('GET /api/jobs/:id', () => {
  it('shows its client every quote, best first, without withdrawn ones', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const pricey = await createBuilder({ businessName: 'Pricey' })
    const cheap = await createBuilder({ businessName: 'Cheap' })
    const gone = await createBuilder({ businessName: 'Gone' })
    const declined = await createBuilder({ businessName: 'Declined' })
    await sendQuote(pricey, job.id, { amount: 5_000_000 })
    await sendQuote(cheap, job.id, { amount: 2_000_000, weeks: null, message: 'Cheap and cheerful.' })
    await sendQuote(gone, job.id)
    await gone.agent.delete(`/api/jobs/${job.id}/quote`)
    const lowball = await sendQuote(declined, job.id, { amount: 1_000_000 })
    await ana.agent.post(`/api/quotes/${lowball.id}/decline`)

    const res = await ana.agent.get(`/api/jobs/${job.id}`)
    expect(res.status).toBe(200)
    expect(res.body.job.pendingQuotes).toBe(2)
    expect(res.body.quotes.map((q: { builder: { businessName: string } }) => q.builder.businessName)).toEqual([
      'Cheap',
      'Pricey',
      'Declined',
    ])
    expect(res.body.quotes[0]).toEqual({
      id: expect.any(Number),
      jobId: job.id,
      amount: 2_000_000,
      weeks: null,
      message: 'Cheap and cheerful.',
      status: 'pending',
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
      builder: {
        id: cheap.user.id,
        name: cheap.name,
        businessName: 'Cheap',
        serviceArea: 'Denver, CO',
        insured: true,
        licensed: true,
        rating: null,
        reviewCount: 0,
      },
      job: { id: job.id, title: 'New kitchen', location: 'Denver, CO', status: 'open', trade: 'kitchens' },
      projectId: null,
    })
  })

  it('shows a builder an open job with their quote, and a closed one only if they quoted', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const bob = await createBuilder()
    const cat = await createBuilder()

    let res = await bob.agent.get(`/api/jobs/${job.id}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ job: expect.objectContaining({ id: job.id }), myQuote: null })

    await sendQuote(bob, job.id)
    await ana.agent.post(`/api/jobs/${job.id}/close`)
    res = await bob.agent.get(`/api/jobs/${job.id}`)
    expect(res.status).toBe(200)
    expect(res.body.myQuote.status).toBe('declined')
    expect((await cat.agent.get(`/api/jobs/${job.id}`)).status).toBe(404)
  })

  it("is 404 for another client's job, or one that doesn't exist", async () => {
    const job = await postJob(await createClient())
    const eve = await createClient()
    expect((await eve.agent.get(`/api/jobs/${job.id}`)).status).toBe(404)
    expect((await eve.agent.get('/api/jobs/999999')).status).toBe(404)
  })
})

describe('PUT /api/jobs/:id/quote', () => {
  it('sends a quote, then changes it, and tells the client each time', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const bob = await createBuilder()
    const heard = vi.fn()
    const stop = subscribe(ana.user.id, heard)

    let res = await bob.agent.put(`/api/jobs/${job.id}/quote`).send({ amount: 2_000_000, weeks: 4, message: 'Hi' })
    expect(res.status).toBe(201)
    expect(res.body.quote).toMatchObject({ amount: 2_000_000, weeks: 4, message: 'Hi', status: 'pending' })
    res = await bob.agent.put(`/api/jobs/${job.id}/quote`).send({ amount: 1_900_000, weeks: '', message: 'Cheaper' })
    expect(res.status).toBe(200)
    expect(res.body.quote).toMatchObject({ amount: 1_900_000, weeks: null, message: 'Cheaper' })
    expect(heard).toHaveBeenCalledTimes(2)
    stop()

    const [rows] = await db.query('SELECT COUNT(*) AS n FROM quotes')
    expect((rows as { n: number }[])[0].n).toBe(1)
  })

  it('can quote again after withdrawing, but not after being declined', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const bob = await createBuilder()
    await sendQuote(bob, job.id)
    await bob.agent.delete(`/api/jobs/${job.id}/quote`)
    const again = await sendQuote(bob, job.id)
    expect(again.status).toBe('pending')

    await ana.agent.post(`/api/quotes/${again.id}/decline`)
    const res = await bob.agent.put(`/api/jobs/${job.id}/quote`).send({ amount: 100, message: 'Please?' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('The client has declined your quote for this job.')
  })

  it.each([
    [{ amount: 0 }, 'Enter your price.'],
    [{ amount: -100 }, 'Enter your price.'],
    [{ amount: '100' }, 'Enter your price.'],
    [{ amount: 1_000_000_001 }, 'Enter your price.'],
    [{ weeks: 0 }, 'The length of the job should be a whole number of weeks.'],
    [{ weeks: 1.5 }, 'The length of the job should be a whole number of weeks.'],
    [{ message: ' ' }, "Say what's included in your price."],
    [{ message: 'x'.repeat(2001) }, 'Keep your message under 2,000 characters.'],
  ])('refuses %j', async (overrides, error) => {
    const job = await postJob(await createClient())
    const bob = await createBuilder()
    const res = await bob.agent.put(`/api/jobs/${job.id}/quote`).send({ amount: 100, weeks: 2, message: 'Hi', ...overrides })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it('needs a business profile and an open job', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const noProfile = await signUp({ role: 'builder' })
    let res = await noProfile.agent.put(`/api/jobs/${job.id}/quote`).send({ amount: 100, message: 'Hi' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Set up your business profile before sending quotes.')

    await ana.agent.post(`/api/jobs/${job.id}/close`)
    const bob = await createBuilder()
    res = await bob.agent.put(`/api/jobs/${job.id}/quote`).send({ amount: 100, message: 'Hi' })
    expect(res.status).toBe(404)
    expect((await bob.agent.put('/api/jobs/999999/quote').send({ amount: 100, message: 'Hi' })).status).toBe(404)
  })
})

describe('DELETE /api/jobs/:id/quote', () => {
  it('withdraws a quote waiting for an answer', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const bob = await createBuilder()
    await sendQuote(bob, job.id)
    expect((await bob.agent.delete(`/api/jobs/${job.id}/quote`)).status).toBe(204)
    expect((await ana.agent.get(`/api/jobs/${job.id}`)).body.quotes).toEqual([])
    expect((await bob.agent.delete(`/api/jobs/${job.id}/quote`)).status).toBe(404)
  })

  it("can't withdraw an answered quote, or one you never sent", async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const bob = await createBuilder()
    const quote = await sendQuote(bob, job.id)
    await ana.agent.post(`/api/quotes/${quote.id}/accept`)
    const res = await bob.agent.delete(`/api/jobs/${job.id}/quote`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('The client has already answered this quote.')
    expect((await (await createBuilder()).agent.delete(`/api/jobs/${job.id}/quote`)).status).toBe(404)
    expect((await bob.agent.delete('/api/jobs/abc/quote')).status).toBe(404)
  })
})

describe('POST /api/quotes/:id/accept', () => {
  it('hires the builder: starts the project, declines the other quotes and opens a conversation', async () => {
    const ana = await createClient({ name: 'Ana Lima' })
    const job = await postJob(ana, { title: 'Kitchen', description: 'New cabinets.', location: 'Aurora, CO' })
    const bob = await createBuilder()
    const cat = await createBuilder()
    const bobQuote = await sendQuote(bob, job.id, { amount: 4_200_000 })
    await sendQuote(cat, job.id)
    const bobHeard = vi.fn()
    const catHeard = vi.fn()
    const stops = [subscribe(bob.user.id, bobHeard), subscribe(cat.user.id, catHeard)]

    const res = await ana.agent.post(`/api/quotes/${bobQuote.id}/accept`)
    expect(res.status).toBe(200)
    const projectId = res.body.projectId
    expect(bobHeard).toHaveBeenCalledWith({ type: 'project', projectId })
    expect(catHeard).toHaveBeenCalledWith({ type: 'job', jobId: job.id })
    for (const stop of stops) stop()

    const project = (await ana.agent.get(`/api/projects/${projectId}`)).body.project
    expect(project).toMatchObject({
      title: 'Kitchen',
      description: 'New cabinets.',
      address: 'Aurora, CO',
      status: 'active',
      client: { id: ana.user.id, name: 'Ana Lima' },
      builder: { id: bob.user.id },
      money: { contract: 4_200_000, total: 4_200_000 },
      fromQuote: { jobId: job.id, weeks: 6, message: 'Everything included.' },
      conversationId: expect.any(Number),
    })
    expect(project.acceptedAt).toEqual(expect.any(Number))

    const view = (await ana.agent.get(`/api/jobs/${job.id}`)).body
    expect(view.job).toMatchObject({ status: 'hired', projectId })
    expect(view.quotes.map((q: { status: string }) => q.status)).toEqual(['accepted', 'declined'])
    expect(view.quotes.map((q: { projectId: number | null }) => q.projectId)).toEqual([projectId, null])

    // The hired builder can get from their quote to the project.
    const bobView = (await bob.agent.get(`/api/jobs/${job.id}`)).body
    expect(bobView.myQuote).toMatchObject({ status: 'accepted', projectId })
    const bobQuotes = (await bob.agent.get('/api/quotes/mine')).body.quotes
    expect(bobQuotes[0]).toMatchObject({ id: bobQuote.id, projectId })
  })

  it('only works once, and only on a pending quote of an open job', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const bob = await createBuilder()
    const cat = await createBuilder()
    const first = await sendQuote(bob, job.id)
    const second = await sendQuote(cat, job.id)
    await ana.agent.post(`/api/quotes/${first.id}/accept`)

    let res = await ana.agent.post(`/api/quotes/${first.id}/accept`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('This job has already been closed or given to a builder.')

    const other = await postJob(ana)
    const declined = await sendQuote(bob, other.id)
    await ana.agent.post(`/api/quotes/${declined.id}/decline`)
    res = await ana.agent.post(`/api/quotes/${declined.id}/accept`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('This quote is no longer waiting for an answer.')
    expect(second).toBeDefined()
  })

  it("can't accept a quote on someone else's job, or a withdrawn one", async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const bob = await createBuilder()
    const quote = await sendQuote(bob, job.id)
    const eve = await createClient()
    expect((await eve.agent.post(`/api/quotes/${quote.id}/accept`)).status).toBe(404)
    expect((await bob.agent.post(`/api/quotes/${quote.id}/accept`)).status).toBe(403)
    await bob.agent.delete(`/api/jobs/${job.id}/quote`)
    const res = await ana.agent.post(`/api/quotes/${quote.id}/accept`)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("This quote doesn't exist.")
    expect((await ana.agent.post('/api/quotes/999999/accept')).status).toBe(404)
  })

  it('changes nothing if creating the project fails', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const quote = await sendQuote(await createBuilder(), job.id)
    breakDatabase('INSERT INTO projects')
    expect((await ana.agent.post(`/api/quotes/${quote.id}/accept`)).status).toBe(500)
    vi.restoreAllMocks()
    const view = (await ana.agent.get(`/api/jobs/${job.id}`)).body
    expect(view.job.status).toBe('open')
    expect(view.quotes[0].status).toBe('pending')
  })
})

describe('POST /api/quotes/:id/decline', () => {
  it('declines one quote and keeps the job open', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const bob = await createBuilder()
    const quote = await sendQuote(bob, job.id)
    const res = await ana.agent.post(`/api/quotes/${quote.id}/decline`)
    expect(res.status).toBe(200)
    expect(res.body.quote.status).toBe('declined')
    expect((await ana.agent.get(`/api/jobs/${job.id}`)).body.job.status).toBe('open')
    expect((await ana.agent.post(`/api/quotes/${quote.id}/decline`)).status).toBe(409)
  })
})

describe('GET /api/quotes/mine', () => {
  it('lists your quotes with their jobs, most recently changed first', async () => {
    const ana = await createClient()
    const first = await postJob(ana, { title: 'First' })
    const second = await postJob(ana, { title: 'Second' })
    const bob = await createBuilder()
    await sendQuote(bob, first.id)
    await sendQuote(bob, second.id)
    await db.query('UPDATE quotes SET updated_at = NOW() - INTERVAL 1 DAY WHERE job_id = ?', [first.id])
    const { quotes } = (await bob.agent.get('/api/quotes/mine')).body
    expect(quotes.map((q: { job: { title: string } }) => q.job.title)).toEqual(['Second', 'First'])
  })

  it('is only for builders', async () => {
    expect((await (await createClient()).agent.get('/api/quotes/mine')).status).toBe(403)
    expect((await newAgent().get('/api/quotes/mine')).status).toBe(401)
  })
})
