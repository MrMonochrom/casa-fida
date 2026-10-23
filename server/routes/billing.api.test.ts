import { beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribe } from '../events.ts'
import { activeProject, createBuilder, createClient, propose, resetDb } from '../test/helpers.ts'
import type { Person } from '../test/helpers.ts'

beforeEach(resetDb)

/** A builder and a client with an active project at this price (in cents). */
async function working(price = 10_000_000): Promise<{ bob: Person; ana: Person; id: number }> {
  const bob = await createBuilder()
  const ana = await createClient()
  const id = await activeProject(bob, ana, { contractAmount: price })
  return { bob, ana, id }
}

const change = (overrides: Record<string, unknown> = {}) => ({
  title: 'Add a skylight',
  description: 'Over the island.',
  amount: 285_000,
  days: 3,
  ...overrides,
})

async function sendChange(bob: Person, id: number, overrides: Record<string, unknown> = {}) {
  const res = await bob.agent.post(`/api/projects/${id}/change-orders`).send(change(overrides))
  if (res.status !== 201) throw new Error(`Change order failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.project.changeOrders[0] as { id: number }
}

describe('change orders', () => {
  it('sends a change to the client, who approves it: the price and schedule change', async () => {
    const { bob, ana, id } = await working()
    const heard = vi.fn()
    const stop = subscribe(ana.user.id, heard)
    const res = await bob.agent.post(`/api/projects/${id}/change-orders`).send(change({ description: 'Line one\r\nLine two' }))
    stop()
    expect(res.status).toBe(201)
    expect(heard).toHaveBeenCalledWith({ type: 'project', projectId: id })
    const sent = res.body.project.changeOrders[0]
    expect(sent).toEqual({
      id: expect.any(Number),
      title: 'Add a skylight',
      description: 'Line one\nLine two',
      amount: 285_000,
      days: 3,
      status: 'pending',
      createdAt: expect.any(Number),
      decidedAt: null,
    })
    // Nothing counts until the client approves.
    expect(res.body.project.money).toMatchObject({ contract: 10_000_000, changes: 0, total: 10_000_000, daysAdded: 0 })

    const builderHeard = vi.fn()
    const stopBuilder = subscribe(bob.user.id, builderHeard)
    const approved = await ana.agent.post(`/api/change-orders/${sent.id}/approve`)
    stopBuilder()
    expect(approved.status).toBe(200)
    expect(approved.body.project.changeOrders[0]).toMatchObject({ status: 'approved', decidedAt: expect.any(Number) })
    expect(approved.body.project.money).toMatchObject({ changes: 285_000, total: 10_285_000, leftToInvoice: 10_285_000, daysAdded: 3 })
    expect(builderHeard).toHaveBeenCalledWith({ type: 'project', projectId: id })
  })

  it('can take work out, but not below a price of zero', async () => {
    const { bob, ana, id } = await working(1_000_000)
    const removed = await sendChange(bob, id, { amount: -400_000, days: -2 })
    const res = await ana.agent.post(`/api/change-orders/${removed.id}/approve`)
    expect(res.body.project.money).toMatchObject({ total: 600_000, daysAdded: -2 })

    const tooMuch = await bob.agent.post(`/api/projects/${id}/change-orders`).send(change({ amount: -600_001 }))
    expect(tooMuch.status).toBe(400)
    expect(tooMuch.body.error).toBe("A change can't take the price below zero.")
    // Exactly down to zero is fine, and so is a change that only moves the schedule.
    expect((await bob.agent.post(`/api/projects/${id}/change-orders`).send(change({ amount: -600_000 }))).status).toBe(201)
    expect((await bob.agent.post(`/api/projects/${id}/change-orders`).send(change({ amount: 0, days: '' }))).status).toBe(201)
  })

  it.each([
    [{ title: '' }, 'Give the change a short title.'],
    [{ title: 'x'.repeat(121) }, 'Give the change a short title.'],
    [{ description: ' ' }, 'Describe what changes.'],
    [{ description: 'x'.repeat(4001) }, 'Keep the description under 4,000 characters.'],
    [{ amount: '2850' }, 'Enter how much the price changes: 0 if it stays the same.'],
    [{ amount: 12.5 }, 'Enter how much the price changes: 0 if it stays the same.'],
    [{ days: 366 }, 'The schedule change should be a whole number of days, up to 365.'],
    [{ days: 1.5 }, 'The schedule change should be a whole number of days, up to 365.'],
  ])('refuses the change %j', async (overrides, error) => {
    const { bob, id } = await working()
    const res = await bob.agent.post(`/api/projects/${id}/change-orders`).send(change(overrides))
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it('is declined or withdrawn only while pending, and only by the right side', async () => {
    const { bob, ana, id } = await working()
    const first = await sendChange(bob, id)

    let res = await bob.agent.post(`/api/change-orders/${first.id}/approve`)
    expect(res.status).toBe(403)
    res = await ana.agent.post(`/api/change-orders/${first.id}/withdraw`)
    expect(res.status).toBe(403)

    res = await ana.agent.post(`/api/change-orders/${first.id}/decline`)
    expect(res.status).toBe(200)
    expect(res.body.project.changeOrders[0].status).toBe('declined')
    expect(res.body.project.money.total).toBe(10_000_000)

    res = await ana.agent.post(`/api/change-orders/${first.id}/approve`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('This change order has already been answered.')

    const second = await sendChange(bob, id)
    res = await bob.agent.post(`/api/change-orders/${second.id}/withdraw`)
    expect(res.status).toBe(200)
    expect(res.body.project.changeOrders[0].status).toBe('withdrawn')
    expect((await ana.agent.post(`/api/change-orders/${second.id}/approve`)).status).toBe(409)
  })

  it("is 404 for people who aren't on the project", async () => {
    const { bob, id } = await working()
    const sent = await sendChange(bob, id)
    const eve = await createClient()
    const res = await eve.agent.post(`/api/change-orders/${sent.id}/approve`)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("This change order doesn't exist.")
    expect((await eve.agent.post('/api/change-orders/999999/approve')).status).toBe(404)
    expect((await (await createBuilder()).agent.post(`/api/projects/${id}/change-orders`).send(change())).status).toBe(404)
  })

  it('only happens on an active project', async () => {
    const bob = await createBuilder()
    const proposal = await propose(bob, 'ana@example.com')
    const res = await bob.agent.post(`/api/projects/${proposal.id}/change-orders`).send(change())
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("You can't do that while the project is still a proposal.")
  })
})

describe('invoices', () => {
  const invoice = (overrides: Record<string, unknown> = {}) => ({
    title: 'Deposit',
    amount: 1_000_000,
    dueDate: '2030-01-15',
    ...overrides,
  })

  it('bills the client, numbering invoices 1, 2, 3…', async () => {
    const { bob, ana, id } = await working()
    const heard = vi.fn()
    const stop = subscribe(ana.user.id, heard)
    let res = await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice())
    stop()
    expect(res.status).toBe(201)
    expect(heard).toHaveBeenCalledWith({ type: 'project', projectId: id })
    res = await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice({ title: 'Framing', amount: 2_500_050 }))
    expect(res.body.project.invoices).toEqual([
      {
        id: expect.any(Number),
        number: 1,
        title: 'Deposit',
        amount: 1_000_000,
        dueDate: '2030-01-15',
        status: 'due',
        overdue: false,
        createdAt: expect.any(Number),
        paidAt: null,
      },
      expect.objectContaining({ number: 2, title: 'Framing', amount: 2_500_050 }),
    ])
    expect(res.body.project.money).toMatchObject({ invoiced: 3_500_050, paid: 0, outstanding: 3_500_050, leftToInvoice: 6_499_950 })
    expect((await ana.agent.get(`/api/projects/${id}`)).body.project.invoices).toHaveLength(2)
  })

  it('marks invoices overdue after their due date', async () => {
    const { bob, id } = await working()
    const res = await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice({ dueDate: '2020-01-01' }))
    expect(res.body.project.invoices[0]).toMatchObject({ status: 'due', overdue: true })
  })

  it("won't bill more than the price with its approved changes", async () => {
    const { bob, ana, id } = await working(1_000_000)
    let res = await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice({ amount: 1_000_001 }))
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("That's more than is left to invoice ($10,000).")

    await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice({ amount: 1_000_000 }))
    res = await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice({ amount: 1 }))
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Everything on this project has been invoiced already. Send a change order for extra work.')

    const extra = await sendChange(bob, id, { amount: 50_000 })
    await ana.agent.post(`/api/change-orders/${extra.id}/approve`)
    expect((await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice({ amount: 50_000 }))).status).toBe(201)
  })

  it.each([
    [{ title: '' }, 'Say what the invoice is for, like "Deposit".'],
    [{ amount: 0 }, 'Enter the amount to bill.'],
    [{ amount: -100 }, 'Enter the amount to bill.'],
    [{ dueDate: '2030-02-30' }, 'Choose when the invoice is due.'],
    [{ dueDate: '' }, 'Choose when the invoice is due.'],
  ])('refuses the invoice %j', async (overrides, error) => {
    const { bob, id } = await working()
    const res = await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice(overrides))
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it('marks an invoice paid, once', async () => {
    const { bob, ana, id } = await working()
    const sent = (await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice())).body.project.invoices[0]
    expect((await ana.agent.post(`/api/invoices/${sent.id}/paid`)).status).toBe(403)

    let res = await bob.agent.post(`/api/invoices/${sent.id}/paid`)
    expect(res.status).toBe(200)
    expect(res.body.project.invoices[0]).toMatchObject({ status: 'paid', paidAt: expect.any(Number) })
    expect(res.body.project.money).toMatchObject({ paid: 1_000_000, outstanding: 0 })

    res = await bob.agent.post(`/api/invoices/${sent.id}/void`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('This invoice is already paid or void.')
  })

  it('voids an invoice, so its amount can be billed again', async () => {
    const { bob, id } = await working(1_000_000)
    const sent = (await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice())).body.project.invoices[0]
    const res = await bob.agent.post(`/api/invoices/${sent.id}/void`)
    expect(res.body.project.invoices[0]).toMatchObject({ status: 'void', paidAt: null })
    expect(res.body.project.money).toMatchObject({ invoiced: 0, leftToInvoice: 1_000_000 })
    expect((await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice())).status).toBe(201)
  })

  it('can still bill once the project is completed', async () => {
    const { bob, id } = await working()
    await bob.agent.post(`/api/projects/${id}/complete`)
    expect((await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice())).status).toBe(201)
  })

  it("is 404 for people who aren't on the project", async () => {
    const { bob, id } = await working()
    const sent = (await bob.agent.post(`/api/projects/${id}/invoices`).send(invoice())).body.project.invoices[0]
    const cat = await createBuilder()
    const res = await cat.agent.post(`/api/invoices/${sent.id}/paid`)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("This invoice doesn't exist.")
    expect((await cat.agent.post(`/api/projects/${id}/invoices`).send(invoice())).status).toBe(404)
  })
})
