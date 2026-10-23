import { beforeEach, describe, expect, it } from 'vitest'
import { outbox } from '../mailer.ts'
import { createBuilder, createClient, postJob, propose, resetDb, sendQuote } from '../test/helpers.ts'

beforeEach(resetDb)

describe('currencies', () => {
  it('carries a job’s currency to its quotes, the project and its messages', async () => {
    const ana = await createClient()
    const bob = await createBuilder()
    const job = await postJob(ana, { currency: 'MDL', budgetMin: 50_000_000, budgetMax: 80_000_000 })
    expect(job).toMatchObject({ currency: 'MDL' })

    const quote = await sendQuote(bob, job.id, { amount: 70_000_000, currency: 'MDL' })
    expect(quote).toMatchObject({ amount: 70_000_000, currency: 'MDL' })
    const forAna = (await ana.agent.get(`/api/jobs/${job.id}`)).body
    expect(forAna.quotes[0]).toMatchObject({ currency: 'MDL' })

    const { projectId } = (await ana.agent.post(`/api/quotes/${quote.id}/accept`)).body
    const project = (await bob.agent.get(`/api/projects/${projectId}`)).body.project
    expect(project).toMatchObject({ currency: 'MDL', money: { contract: 70_000_000 } })
    expect((await ana.agent.get('/api/projects')).body.projects[0]).toMatchObject({ currency: 'MDL' })

    const tooMuch = await bob.agent
      .post(`/api/projects/${projectId}/invoices`)
      .send({ title: 'All of it and more', amount: 80_000_000, dueDate: '2026-12-01' })
    expect(tooMuch.status).toBe(409)
    // Intl puts a no-break space between the code and the amount.
    expect(tooMuch.body.error.replace(/\s/g, ' ')).toBe("That's more than is left to invoice (MDL 700,000).")
  })

  it('lets a client change the currency only until builders quote', async () => {
    const ana = await createClient()
    const bob = await createBuilder()
    const job = await postJob(ana)
    const edit = (currency: string) => ana.agent.put(`/api/jobs/${job.id}`).send({ ...job, trade: 'kitchens', currency })

    expect((await edit('EUR')).body.job).toMatchObject({ currency: 'EUR' })
    await sendQuote(bob, job.id)
    const locked = await edit('RON')
    expect(locked.status).toBe(409)
    expect(locked.body.error).toBe("The currency can't change once builders have quoted.")
    // Saving other changes without a currency leaves it alone.
    const renamed = await ana.agent
      .put(`/api/jobs/${job.id}`)
      .send({ ...job, trade: 'kitchens', title: 'Kitchen', currency: undefined })
    expect(renamed.body.job).toMatchObject({ title: 'Kitchen', currency: 'EUR' })
  })

  it('refuses a quote priced in a currency the job no longer uses', async () => {
    const ana = await createClient()
    const bob = await createBuilder()
    const job = await postJob(ana, { currency: 'RON' })
    const res = await bob.agent
      .put(`/api/jobs/${job.id}/quote`)
      .send({ amount: 2_500_000, message: 'All in.', currency: 'USD' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("The client changed this job's currency. Look at it again before sending your price.")
  })

  it('prices a proposal in the builder’s currency, fixed once the client accepts', async () => {
    const bob = await createBuilder({ businessName: 'Bob Builds' })
    const ana = await createClient({ email: 'ana@example.com' })
    const project = await propose(bob, 'ana@example.com', { currency: 'EUR', contractAmount: 2_000_000 })
    expect(project).toMatchObject({ currency: 'EUR' })
    expect(outbox.at(-1)!.text).toContain('Price: €20,000')

    const details = { title: 'Bathroom', description: 'Tiles.', address: '', startDate: null, contractAmount: 2_000_000 }
    const changed = await bob.agent.put(`/api/projects/${project.id}`).send({ ...details, currency: 'RUB' })
    expect(changed.body.project).toMatchObject({ currency: 'RUB' })

    await ana.agent.post(`/api/projects/${project.id}/accept`)
    const locked = await bob.agent.put(`/api/projects/${project.id}`).send({ ...details, currency: 'USD' })
    expect(locked.status).toBe(409)
    expect(locked.body.error).toBe('The price is agreed. Send a change order to change it.')
  })

  it('takes the large amounts rubles need, up to 100 million', async () => {
    const bob = await createBuilder()
    await createClient({ email: 'ana@example.com' })
    const house = await propose(bob, 'ana@example.com', { currency: 'RUB', contractAmount: 4_500_000_000 })
    expect(house.money.contract).toBe(4_500_000_000)
    const tooMuch = await bob.agent
      .post('/api/projects')
      .send({ title: 'Palace', description: 'Big.', clientName: 'Ana', clientEmail: 'ana@example.com', currency: 'RUB', contractAmount: 10_000_000_001 })
    expect(tooMuch.status).toBe(400)
  })

  it('refuses currencies it doesn’t know', async () => {
    const bob = await createBuilder()
    const res = await bob.agent
      .post('/api/projects')
      .send({ title: 'Job', description: 'Work.', clientName: 'Ana', clientEmail: 'ana@example.com', currency: 'XYZ', contractAmount: 100 })
    expect(res.body.error).toBe('Choose a currency.')
  })
})
