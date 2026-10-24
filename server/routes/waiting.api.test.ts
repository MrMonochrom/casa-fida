// What's waiting on a client: a proposal to answer, change orders to approve and invoices to pay.
// The menu badge, the project list (and Home's to-dos made from it) and the project page all count it.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db.ts'
import { activeProject, createBuilder, createClient, propose, resetDb } from '../test/helpers.ts'
import type { Person } from '../test/helpers.ts'

beforeEach(resetDb)

const changeOrder = { title: 'Skylight', description: 'A skylight over the island.', amount: 100_000, days: 2 }
const invoice = { title: 'Deposit', amount: 500_000, dueDate: '2030-01-01' }

/** What each place says is waiting for the client. */
async function counts(client: Person, projectId: number) {
  const badge = (await client.agent.get('/api/summary')).body.projects
  const listed = (await client.agent.get('/api/projects')).body.projects.find((p: { id: number }) => p.id === projectId)
  const page = (await client.agent.get(`/api/projects/${projectId}`)).body.project
  return { badge, listed, page }
}

describe('what a client has waiting', () => {
  it('is counted the same by the menu badge, the project list and the project page', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const projectId = await activeProject(bob, ana)
    await bob.agent.post(`/api/projects/${projectId}/change-orders`).send(changeOrder)
    await bob.agent.post(`/api/projects/${projectId}/invoices`).send(invoice)

    const { badge, listed, page } = await counts(ana, projectId)
    expect(listed).toMatchObject({ pendingChanges: 1, dueInvoices: 1, waitingOnClient: 2 })
    expect(page.waitingOnClient).toBe(2)
    expect(badge).toBe(2)
  })

  it('counts a proposal to answer', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const project = await propose(bob, ana.email)

    const { badge, listed, page } = await counts(ana, project.id)
    expect(listed.waitingOnClient).toBe(1)
    expect(page.waitingOnClient).toBe(1)
    expect(badge).toBe(1)
  })

  it('has nothing left that the client can no longer do, once the builder completes the project', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const projectId = await activeProject(bob, ana)
    await bob.agent.post(`/api/projects/${projectId}/change-orders`).send(changeOrder)
    await bob.agent.post(`/api/projects/${projectId}/complete`)

    const { badge, listed, page } = await counts(ana, projectId)
    // Change orders can only be answered while the work is in progress, so they're withdrawn.
    expect(page.changeOrders[0].status).toBe('withdrawn')
    expect(listed).toMatchObject({ pendingChanges: 0, waitingOnClient: 0 })
    expect(page.waitingOnClient).toBe(0)
    expect(badge).toBe(0)
  })

  it("still counts invoices to pay on a completed project, which the builder can still mark paid", async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const projectId = await activeProject(bob, ana)
    await bob.agent.post(`/api/projects/${projectId}/invoices`).send(invoice)
    await bob.agent.post(`/api/projects/${projectId}/complete`)

    const { badge, listed, page } = await counts(ana, projectId)
    expect(listed).toMatchObject({ dueInvoices: 1, waitingOnClient: 1 })
    expect(page.waitingOnClient).toBe(1)
    expect(badge).toBe(1)
  })

  it("leaves out a change order left pending on a completed project from before they were withdrawn", async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const projectId = await activeProject(bob, ana)
    await bob.agent.post(`/api/projects/${projectId}/change-orders`).send(changeOrder)
    // As databases from before this was fixed can have (db/migrations/007 tidies them up).
    await db.execute("UPDATE projects SET status = 'completed', completed_at = NOW() WHERE id = ?", [projectId])

    const { badge, listed, page } = await counts(ana, projectId)
    expect(listed).toMatchObject({ pendingChanges: 0, waitingOnClient: 0 })
    expect(page.waitingOnClient).toBe(0)
    expect(badge).toBe(0)
  })
})
