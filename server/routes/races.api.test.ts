// Answers that cross: a client accepting in one tab and declining in another, a builder changing a
// quote just as it's declined, and so on. Each request reads first and writes after; these make the
// read stale, as if the other request landed in between, and check the write doesn't trust it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db.ts'
import {
  activeProject,
  createBuilder,
  createClient,
  postJob,
  propose,
  resetDb,
  sendQuote,
  staleReads,
} from '../test/helpers.ts'

beforeEach(resetDb)
afterEach(() => vi.restoreAllMocks())

/**
 * Reads of projects (and of quotes and jobs) see them as they were before an answer landed. Only
 * reads of that table itself, which join others to it: not other reads that count it in a subquery,
 * like a job's quotes.
 */
const projectsReadAs = (status: string) => staleReads(/FROM projects p\s+JOIN/, (row) => (row.status = status))
const quotesReadAs = (status: string) => staleReads(/FROM quotes q\s+JOIN/, (row) => (row.status = status))
const jobsReadAs = (status: string) => staleReads(/FROM jobs j\s+JOIN/, (row) => (row.status = status))

async function statusOf(table: 'projects' | 'quotes' | 'jobs', id: number) {
  const [rows] = await db.query(`SELECT status FROM ${table} WHERE id = ?`, [id])
  return (rows as { status: string }[])[0]?.status
}

describe('proposals', () => {
  it("can't be declined once accepted in another tab", async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const project = await propose(bob, ana.email)
    expect((await ana.agent.post(`/api/projects/${project.id}/accept`)).status).toBe(200)

    projectsReadAs('proposed')
    const res = await ana.agent.post(`/api/projects/${project.id}/decline`)
    vi.restoreAllMocks()
    expect(res.status).toBe(409)
    expect(await statusOf('projects', project.id)).toBe('active')
  })

  it("can't be withdrawn by the builder once the client has accepted", async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const project = await propose(bob, ana.email)
    expect((await ana.agent.post(`/api/projects/${project.id}/accept`)).status).toBe(200)

    projectsReadAs('proposed')
    const res = await bob.agent.delete(`/api/projects/${project.id}`)
    vi.restoreAllMocks()
    expect(res.status).toBe(409)
    expect(await statusOf('projects', project.id)).toBe('active')
  })

  it("keep the price the client accepted, even if the builder was changing it", async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const project = await propose(bob, ana.email, { contractAmount: 2_000_000 })
    expect((await ana.agent.post(`/api/projects/${project.id}/accept`)).status).toBe(200)

    projectsReadAs('proposed')
    const res = await bob.agent
      .put(`/api/projects/${project.id}`)
      .send({ title: 'Bathroom remodel', description: 'New tile.', contractAmount: 3_000_000 })
    vi.restoreAllMocks()
    expect(res.status).toBe(409)
    const [rows] = await db.query('SELECT contract_amount FROM projects WHERE id = ?', [project.id])
    expect((rows as { contract_amount: number }[])[0].contract_amount).toBe(2_000_000)
  })

  it('are completed only once', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const projectId = await activeProject(bob, ana)
    expect((await bob.agent.post(`/api/projects/${projectId}/complete`)).status).toBe(200)

    projectsReadAs('active')
    const res = await bob.agent.post(`/api/projects/${projectId}/complete`)
    vi.restoreAllMocks()
    expect(res.status).toBe(409)
  })
})

describe('quotes', () => {
  async function quoted() {
    const ana = await createClient()
    const bob = await createBuilder()
    const job = await postJob(ana)
    const quote = await sendQuote(bob, job.id)
    return { ana, bob, job, quote }
  }

  it("can't be declined once accepted in another tab", async () => {
    const { ana, quote } = await quoted()
    expect((await ana.agent.post(`/api/quotes/${quote.id}/accept`)).status).toBe(200)

    quotesReadAs('pending')
    const res = await ana.agent.post(`/api/quotes/${quote.id}/decline`)
    vi.restoreAllMocks()
    expect(res.status).toBe(409)
    expect(await statusOf('quotes', quote.id)).toBe('accepted')
  })

  it("aren't brought back by the builder changing one just as it's declined", async () => {
    const { ana, bob, job, quote } = await quoted()
    expect((await ana.agent.post(`/api/quotes/${quote.id}/decline`)).status).toBe(200)

    quotesReadAs('pending')
    const res = await bob.agent.put(`/api/jobs/${job.id}/quote`).send({ amount: 2_000_000, message: 'Cheaper now.' })
    vi.restoreAllMocks()
    expect(res.status).toBe(409)
    expect(await statusOf('quotes', quote.id)).toBe('declined')
  })

  it("can't be withdrawn once the client has accepted", async () => {
    const { ana, bob, job, quote } = await quoted()
    expect((await ana.agent.post(`/api/quotes/${quote.id}/accept`)).status).toBe(200)

    quotesReadAs('pending')
    const res = await bob.agent.delete(`/api/jobs/${job.id}/quote`)
    vi.restoreAllMocks()
    expect(res.status).toBe(409)
    expect(await statusOf('quotes', quote.id)).toBe('accepted')
  })

  it("aren't sent on a job that was just closed", async () => {
    const ana = await createClient()
    const bob = await createBuilder()
    const job = await postJob(ana)
    expect((await ana.agent.post(`/api/jobs/${job.id}/close`)).status).toBe(200)

    jobsReadAs('open')
    const res = await bob.agent.put(`/api/jobs/${job.id}/quote`).send({ amount: 2_000_000, message: 'All in.' })
    vi.restoreAllMocks()
    expect(res.status).toBe(404)
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM quotes WHERE job_id = ?', [job.id])
    expect((rows as { n: number }[])[0].n).toBe(0)
  })
})

describe('jobs', () => {
  it("can't be closed once a builder is hired", async () => {
    const ana = await createClient()
    const bob = await createBuilder()
    const job = await postJob(ana)
    const quote = await sendQuote(bob, job.id)
    expect((await ana.agent.post(`/api/quotes/${quote.id}/accept`)).status).toBe(200)

    jobsReadAs('open')
    const res = await ana.agent.post(`/api/jobs/${job.id}/close`)
    vi.restoreAllMocks()
    expect(res.status).toBe(409)
    expect(await statusOf('jobs', job.id)).toBe('hired')
  })

  it("can't be changed once a builder is hired", async () => {
    const ana = await createClient()
    const bob = await createBuilder()
    const job = await postJob(ana)
    const quote = await sendQuote(bob, job.id)
    expect((await ana.agent.post(`/api/quotes/${quote.id}/accept`)).status).toBe(200)

    jobsReadAs('open')
    const res = await ana.agent.put(`/api/jobs/${job.id}`).send({ ...job, title: 'Something else', description: 'Else.' })
    vi.restoreAllMocks()
    expect(res.status).toBe(409)
    const [rows] = await db.query('SELECT title FROM jobs WHERE id = ?', [job.id])
    expect((rows as { title: string }[])[0].title).toBe(job.title)
  })
})

describe('change orders', () => {
  it("can't be approved once the project is completed", async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const projectId = await activeProject(bob, ana)
    const change = await bob.agent
      .post(`/api/projects/${projectId}/change-orders`)
      .send({ title: 'Skylight', description: 'A skylight.', amount: 100_000, days: 1 })
    const changeId = change.body.project.changeOrders[0].id
    expect((await bob.agent.post(`/api/projects/${projectId}/complete`)).status).toBe(200)

    projectsReadAs('active')
    const res = await ana.agent.post(`/api/change-orders/${changeId}/approve`)
    vi.restoreAllMocks()
    expect(res.status).toBe(409)
    const [rows] = await db.query('SELECT status FROM change_orders WHERE id = ?', [changeId])
    expect((rows as { status: string }[])[0].status).toBe('withdrawn')
  })
})
