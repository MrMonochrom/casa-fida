import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { isOnline, publish } from '../events.ts'
import {
  PASSWORD,
  activeProject,
  createBuilder,
  createClient,
  newAgent,
  postJob,
  propose,
  resetDb,
  sendQuote,
} from '../test/helpers.ts'
import type { Person } from '../test/helpers.ts'

beforeEach(resetDb)

describe('GET /api/summary', () => {
  it("counts what's waiting for a client", async () => {
    const ana = await createClient()
    const bob = await createBuilder({ trades: ['kitchens'] })
    const empty = await ana.agent.get('/api/summary')
    expect(empty.body).toEqual({ unreadMessages: 0, projects: 0, jobs: 0 })

    // Two quotes to answer.
    const job = await postJob(ana)
    await sendQuote(bob, job.id)
    await sendQuote(await createBuilder(), job.id)
    // A proposal, a change order and an invoice.
    await propose(bob, ana.email)
    const id = await activeProject(bob, ana)
    await bob.agent.post(`/api/projects/${id}/change-orders`).send({ title: 'Extra', description: 'More', amount: 1000 })
    await bob.agent.post(`/api/projects/${id}/invoices`).send({ title: 'Deposit', amount: 1000, dueDate: '2030-01-01' })
    // A message from the builder.
    const conversation = (await bob.agent.post('/api/conversations').send({ userId: ana.user.id })).body.conversation
    await bob.agent.post(`/api/conversations/${conversation.id}/messages`).send({ text: 'Hi' })

    const res = await ana.agent.get('/api/summary')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ unreadMessages: 1, projects: 3, jobs: 2 })
  })

  it('counts open jobs in a builder’s trades that they have not quoted on', async () => {
    const bob = await createBuilder({ trades: ['kitchens', 'roofing'] })
    const ana = await createClient()
    const kitchen = await postJob(ana, { trade: 'kitchens' })
    await postJob(ana, { trade: 'roofing' })
    await postJob(ana, { trade: 'painting' })
    expect((await bob.agent.get('/api/summary')).body).toEqual({ unreadMessages: 0, projects: 0, jobs: 2 })

    await sendQuote(bob, kitchen.id)
    expect((await bob.agent.get('/api/summary')).body.jobs).toBe(1)
  })

  it('needs you to be logged in', async () => {
    expect((await newAgent().get('/api/summary')).status).toBe(401)
  })
})

describe('GET /api/events', () => {
  let server: ReturnType<typeof app.listen> | null = null

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
    server = null
  })

  /** The session cookie of a fresh login, to open the stream the way a browser would. */
  async function cookieOf(person: Person) {
    const res = await request(app).post('/api/login').send({ email: person.email, password: PASSWORD })
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0]
  }

  /** Opens the event stream and collects what arrives. */
  async function openStream(cookie: string) {
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server!.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    let received = ''
    const waiters: (() => void)[] = []
    const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path: '/api/events', headers: { Cookie: cookie } }, resolve)
      req.on('error', reject)
      req.end()
    })
    response.setEncoding('utf8')
    response.on('data', (chunk: string) => {
      received += chunk
      for (const wake of waiters.splice(0)) wake()
    })
    /** Waits until the stream has sent something containing `text`. */
    async function waitFor(text: string) {
      while (!received.includes(text)) await new Promise<void>((resolve) => waiters.push(resolve))
      return received
    }
    return { response, waitFor, close: () => response.destroy() }
  }

  it('streams events for the logged-in person until they disconnect', async () => {
    const ana = await createClient()
    const stream = await openStream(await cookieOf(ana))
    expect(stream.response.statusCode).toBe(200)
    expect(stream.response.headers['content-type']).toBe('text/event-stream')
    await stream.waitFor('retry: 5000')
    expect(isOnline(ana.user.id)).toBe(true)

    publish(ana.user.id, { type: 'project', projectId: 12 })
    const text = await stream.waitFor('projectId')
    expect(text).toContain('event: project\ndata: {"type":"project","projectId":12}\n\n')

    stream.close()
    for (let i = 0; i < 50 && isOnline(ana.user.id); i++) await new Promise((resolve) => setTimeout(resolve, 10))
    expect(isOnline(ana.user.id)).toBe(false)
  })

  it('needs you to be logged in', async () => {
    expect((await newAgent().get('/api/events')).status).toBe(401)
  })
})
