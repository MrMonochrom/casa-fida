import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db.ts'
import { subscribe } from '../events.ts'
import { outbox } from '../mailer.ts'
import {
  activeProject,
  breakDatabase,
  createBuilder,
  createClient,
  hire,
  newAgent,
  propose,
  resetDb,
  signUp,
  validProposal,
} from '../test/helpers.ts'
import type { Person } from '../test/helpers.ts'

beforeEach(resetDb)

/** The token in the invite link of the newest email. */
function inviteToken(): string {
  const link = /\/invite\?token=(\S+)/.exec(outbox.at(-1)!.text)
  if (!link) throw new Error('No invite link in the last email')
  return decodeURIComponent(link[1])
}

describe('POST /api/projects (proposals)', () => {
  it('sends a proposal to a client with an account, and emails them a link to it', async () => {
    const bob = await createBuilder({ businessName: 'Bob Builds' }, { name: 'Bob Stone' })
    const ana = await createClient({ name: 'Ana Lima', email: 'ana@example.com' })
    const heard = vi.fn()
    const stop = subscribe(ana.user.id, heard)

    const res = await bob.agent
      .post('/api/projects')
      .send(validProposal('ANA@example.com', { stages: ['Demolition', ' Tiling ', 'Demolition', ''] }))
    expect(res.status).toBe(201)
    const project = res.body.project
    expect(project).toMatchObject({
      title: 'Bathroom remodel',
      description: 'New tile, vanity and shower.',
      address: '1 Main St',
      status: 'proposed',
      startDate: '2026-12-01',
      myRole: 'builder',
      builder: { id: bob.user.id, name: 'Bob Stone', businessName: 'Bob Builds' },
      // Until Ana accepts, Bob sees only the name and email he typed, not her own details.
      client: { id: ana.user.id, name: 'Cleo Client', email: 'ana@example.com', phone: null },
      invitedClient: null,
      money: { contract: 2_000_000, changes: 0, total: 2_000_000, invoiced: 0, paid: 0, outstanding: 0, leftToInvoice: 2_000_000 },
      stages: [
        { id: expect.any(Number), name: 'Demolition', status: 'todo' },
        { id: expect.any(Number), name: 'Tiling', status: 'todo' },
      ],
      changeOrders: [],
      invoices: [],
      review: null,
      fromQuote: null,
      conversationId: null,
    })
    expect(heard).toHaveBeenCalledWith({ type: 'project', projectId: project.id })
    stop()

    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ to: 'ana@example.com', subject: 'Bob Builds sent you a project proposal' })
    expect(outbox[0].text).toContain('Bob Stone (Bob Builds) has sent you a proposal')
    expect(outbox[0].text).toContain('Price: $20,000')
    expect(outbox[0].text).toContain(`http://localhost:5174/projects/${project.id}`)

    // The client sees it too.
    const forAna = (await ana.agent.get(`/api/projects/${project.id}`)).body.project
    expect(forAna).toMatchObject({ myRole: 'client', status: 'proposed' })
  })

  it("invites someone without an account by email, with a link only they've seen", async () => {
    const bob = await createBuilder()
    const project = await propose(bob, 'new.person@example.com', { clientName: 'New Person' })
    expect(project).toMatchObject({ client: null, invitedClient: { name: 'New Person', email: 'new.person@example.com' } })
    expect(outbox[0].text).toContain('Create your free account')
    expect(inviteToken()).toMatch(/^[\w-]{40,}$/)
    const [rows] = await db.query('SELECT invite_token_hash FROM projects')
    expect((rows as { invite_token_hash: string }[])[0].invite_token_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it.each([
    [{ title: '' }, 'Give the project a short title.'],
    [{ description: '' }, 'Describe the work this project covers.'],
    [{ description: 'x'.repeat(4001) }, 'Keep the description under 4,000 characters.'],
    [{ address: 'x'.repeat(121) }, 'That address is too long.'],
    [{ startDate: '2026-02-30' }, 'Please enter a valid start date.'],
    [{ contractAmount: 0 }, 'Enter the price for the work.'],
    [{ contractAmount: 99.5 }, 'Enter the price for the work.'],
    [{ clientName: '' }, "Enter your client's name."],
    [{ clientEmail: 'nope' }, "Enter your client's email address."],
    [{ stages: 'Framing' }, 'Stages should be a list of names.'],
    [{ stages: Array.from({ length: 31 }, (_, i) => `Stage ${i}`) }, 'A project can have up to 30 stages.'],
    [{ stages: ['x'.repeat(81)] }, 'Keep stage names under 80 characters.'],
  ])('refuses %j', async (overrides, error) => {
    const bob = await createBuilder()
    const res = await bob.agent.post('/api/projects').send(validProposal('ana@example.com', overrides))
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it("won't send a proposal to yourself or to another builder", async () => {
    const bob = await createBuilder()
    const cat = await createBuilder()
    let res = await bob.agent.post('/api/projects').send(validProposal(bob.email))
    expect(res.body.error).toBe("Use your client's email address, not yours.")
    res = await bob.agent.post('/api/projects').send(validProposal(cat.email))
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('That email belongs to a builder account. Proposals can only go to clients.')
  })

  it('needs a business profile, and is only for builders', async () => {
    const noProfile = await signUp({ role: 'builder' })
    let res = await noProfile.agent.post('/api/projects').send(validProposal('ana@example.com'))
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Set up your business profile before sending proposals.')
    res = await (await createClient()).agent.post('/api/projects').send(validProposal('ana@example.com'))
    expect(res.status).toBe(403)
  })

  it('limits how many proposals one builder sends in an hour', async () => {
    vi.stubEnv('RATE_LIMITS', 'on')
    const bob = await createBuilder()
    for (let i = 0; i < 20; i++) await propose(bob, `c${i}@example.com`)
    const res = await bob.agent.post('/api/projects').send(validProposal('one-more@example.com'))
    expect(res.status).toBe(429)
    vi.unstubAllEnvs()
  })

  it('still creates the proposal if the email fails', async () => {
    const bob = await createBuilder()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(outbox, 'push').mockImplementation(() => {
      throw new Error('mail down')
    })
    const res = await bob.agent.post('/api/projects').send(validProposal('ana@example.com'))
    expect(res.status).toBe(201)
    expect(errors).toHaveBeenCalledWith('Proposal email failed:', expect.any(Error))
    vi.restoreAllMocks()
  })

  it('saves nothing if adding the stages fails', async () => {
    const bob = await createBuilder()
    breakDatabase('INSERT INTO stages')
    const res = await bob.agent.post('/api/projects').send(validProposal('ana@example.com', { stages: ['One'] }))
    expect(res.status).toBe(500)
    vi.restoreAllMocks()
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM projects')
    expect((rows as { n: number }[])[0].n).toBe(0)
  })
})

describe('invite links', () => {
  async function invited() {
    const bob = await createBuilder({ businessName: 'Bob Builds' }, { name: 'Bob Stone' })
    const project = await propose(bob, 'new@example.com', { clientName: 'Nina New', title: 'Deck' })
    return { bob, project, token: inviteToken() }
  }

  it('previews the invite without logging in', async () => {
    const { token } = await invited()
    const res = await newAgent().post('/api/invites/preview').send({ token })
    expect(res.status).toBe(200)
    expect(res.body.invite).toEqual({
      businessName: 'Bob Builds',
      builderName: 'Bob Stone',
      title: 'Deck',
      clientName: 'Nina New',
      clientEmail: 'new@example.com',
    })
  })

  it('adds the proposal to the client who opens it, once', async () => {
    const { bob, project, token } = await invited()
    const nina = await createClient({ email: 'nina.other@example.com', name: 'Nina' })
    const heard = vi.fn()
    const stop = subscribe(bob.user.id, heard)

    const res = await nina.agent.post('/api/invites/claim').send({ token })
    expect(res.status).toBe(200)
    expect(res.body.projectId).toBe(project.id)
    expect(heard).toHaveBeenCalledWith({ type: 'project', projectId: project.id })
    stop()
    const forNina = (await nina.agent.get(`/api/projects/${project.id}`)).body.project
    expect(forNina).toMatchObject({ myRole: 'client', client: { id: nina.user.id }, invitedClient: null })

    // The link can't be used again.
    const eve = await createClient()
    expect((await eve.agent.post('/api/invites/claim').send({ token })).status).toBe(404)
    expect((await newAgent().post('/api/invites/preview').send({ token })).status).toBe(404)
  })

  it('is for client accounts only', async () => {
    const { token } = await invited()
    const cat = await createBuilder()
    const res = await cat.agent.post('/api/invites/claim').send({ token })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Proposals are for client accounts. Log out and sign up as a client to accept it.')
  })

  it.each([[''], ['made-up'], ['x'.repeat(101)], [undefined]])('refuses the token %j', async (token) => {
    await invited()
    const res = await newAgent().post('/api/invites/preview').send({ token })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('This invite link has expired or was already used. Ask your builder for a new one.')
    expect((await (await createClient()).agent.post('/api/invites/claim').send({ token })).status).toBe(404)
  })

  it('stops working once the proposal is withdrawn', async () => {
    const { bob, project, token } = await invited()
    await bob.agent.delete(`/api/projects/${project.id}`)
    expect((await newAgent().post('/api/invites/preview').send({ token })).status).toBe(404)
  })

  it('can be replaced with a fresh link, which retires the old one', async () => {
    const { bob, project, token } = await invited()
    const res = await bob.agent.post(`/api/projects/${project.id}/invite-link`)
    expect(res.status).toBe(200)
    expect(res.body.link).toMatch(/^http:\/\/localhost:5174\/invite\?token=/)
    const fresh = decodeURIComponent(res.body.link.split('token=')[1])
    expect((await newAgent().post('/api/invites/preview').send({ token })).status).toBe(404)
    expect((await newAgent().post('/api/invites/preview').send({ token: fresh })).status).toBe(200)
  })

  it("doesn't make a link once the client has the proposal", async () => {
    const bob = await createBuilder()
    const ana = await createClient({ name: 'Ana' })
    const project = await propose(bob, ana.email)
    const res = await bob.agent.post(`/api/projects/${project.id}/invite-link`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Ana already has this proposal in their account.')
  })
})

describe('accepting and declining proposals', () => {
  it('starts the project when the client accepts, and opens a conversation', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const project = await propose(bob, ana.email)
    const heard = vi.fn()
    const stop = subscribe(bob.user.id, heard)

    const res = await ana.agent.post(`/api/projects/${project.id}/accept`)
    expect(res.status).toBe(200)
    expect(res.body.project).toMatchObject({ status: 'active', conversationId: expect.any(Number) })
    expect(res.body.project.acceptedAt).toEqual(expect.any(Number))
    expect(heard).toHaveBeenCalledWith({ type: 'project', projectId: project.id })
    stop()
    expect((await ana.agent.post(`/api/projects/${project.id}/accept`)).status).toBe(409)
  })

  it('marks it declined when the client declines', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const project = await propose(bob, ana.email)
    const res = await ana.agent.post(`/api/projects/${project.id}/decline`)
    expect(res.body.project.status).toBe('declined')
    const accept = await ana.agent.post(`/api/projects/${project.id}/accept`)
    expect(accept.status).toBe(409)
    expect(accept.body.error).toBe("You can't do that while the project is declined.")
  })

  it('only lets the client answer', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const project = await propose(bob, ana.email)
    const res = await bob.agent.post(`/api/projects/${project.id}/accept`)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Only clients can do that.')
    expect((await (await createClient()).agent.post(`/api/projects/${project.id}/accept`)).status).toBe(404)
  })

  it('handles the proposal changing while accepting', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const project = await propose(bob, ana.email)
    // Someone else's request declines it between the check and the update.
    const execute = db.getConnection.bind(db)
    vi.spyOn(db, 'getConnection').mockImplementation(async () => {
      await db.query("UPDATE projects SET status = 'declined'")
      return execute()
    })
    const res = await ana.agent.post(`/api/projects/${project.id}/accept`)
    vi.restoreAllMocks()
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('This proposal has changed. Please look again.')
  })
})

describe('PUT /api/projects/:id', () => {
  it('changes a proposal, including its price', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const project = await propose(bob, ana.email)
    const res = await bob.agent
      .put(`/api/projects/${project.id}`)
      .send({ ...validProposal(ana.email), title: 'Bigger remodel', startDate: '', contractAmount: 2_500_000 })
    expect(res.status).toBe(200)
    expect(res.body.project).toMatchObject({ title: 'Bigger remodel', startDate: null, money: { contract: 2_500_000 } })
  })

  it('keeps the agreed price once the project is active', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const id = await activeProject(bob, ana)
    let res = await bob.agent.put(`/api/projects/${id}`).send({ ...validProposal(ana.email), contractAmount: 1 })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('The price is agreed. Send a change order to change it.')
    // Sending the same price, or none, is fine.
    res = await bob.agent.put(`/api/projects/${id}`).send({ ...validProposal(ana.email), title: 'Renamed' })
    expect(res.status).toBe(200)
    expect(res.body.project.title).toBe('Renamed')
  })

  it('checks what it saves', async () => {
    const bob = await createBuilder()
    const project = await propose(bob, 'ana@example.com')
    let res = await bob.agent.put(`/api/projects/${project.id}`).send(validProposal('ana@example.com', { title: '' }))
    expect(res.status).toBe(400)
    res = await bob.agent.put(`/api/projects/${project.id}`).send(validProposal('ana@example.com', { contractAmount: -1 }))
    expect(res.body.error).toBe('Enter the price for the work.')
  })

  it('is only for the builder on the project', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const project = await propose(bob, ana.email)
    expect((await ana.agent.put(`/api/projects/${project.id}`).send(validProposal(ana.email))).status).toBe(403)
    const cat = await createBuilder()
    expect((await cat.agent.put(`/api/projects/${project.id}`).send(validProposal(ana.email))).status).toBe(404)
  })
})

describe('DELETE /api/projects/:id', () => {
  it('withdraws a proposal, or clears away a declined one', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const first = await propose(bob, ana.email)
    expect((await bob.agent.delete(`/api/projects/${first.id}`)).status).toBe(204)
    expect((await ana.agent.get(`/api/projects/${first.id}`)).status).toBe(404)

    const second = await propose(bob, ana.email)
    await ana.agent.post(`/api/projects/${second.id}/decline`)
    expect((await bob.agent.delete(`/api/projects/${second.id}`)).status).toBe(204)
  })

  it("can't delete an active project", async () => {
    const bob = await createBuilder()
    const id = await activeProject(bob, await createClient())
    const res = await bob.agent.delete(`/api/projects/${id}`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("You can't do that while the project is in progress.")
  })
})

describe('completing and reviewing', () => {
  async function completed(): Promise<{ bob: Person; ana: Person; id: number }> {
    const bob = await createBuilder()
    const ana = await createClient()
    const id = await hire(ana, bob)
    return { bob, ana, id }
  }

  it('completes the project and marks every stage done', async () => {
    const { bob, ana, id } = await completed()
    await bob.agent.post(`/api/projects/${id}/stages`).send({ name: 'Framing' })
    const heard = vi.fn()
    const stop = subscribe(ana.user.id, heard)
    const res = await bob.agent.post(`/api/projects/${id}/complete`)
    expect(res.status).toBe(200)
    expect(res.body.project.status).toBe('completed')
    expect(res.body.project.completedAt).toEqual(expect.any(Number))
    expect(res.body.project.stages[0].status).toBe('done')
    expect(heard).toHaveBeenCalled()
    stop()
    expect((await bob.agent.post(`/api/projects/${id}/complete`)).status).toBe(409)
    expect((await ana.agent.post(`/api/projects/${id}/complete`)).status).toBe(403)
  })

  it('takes one review from the client once the project is completed', async () => {
    const { bob, ana, id } = await completed()
    let res = await ana.agent.post(`/api/projects/${id}/review`).send({ rating: 5, body: 'Great' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("You can't do that while the project is in progress.")

    await bob.agent.post(`/api/projects/${id}/complete`)
    res = await ana.agent.post(`/api/projects/${id}/review`).send({ rating: 4, body: '  Good work.  ' })
    expect(res.status).toBe(201)
    expect(res.body.project.review).toEqual({ id: expect.any(Number), rating: 4, body: 'Good work.', createdAt: expect.any(Number) })

    res = await ana.agent.post(`/api/projects/${id}/review`).send({ rating: 5 })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("You've already reviewed this project.")
    expect((await bob.agent.post(`/api/projects/${id}/review`).send({ rating: 5 })).status).toBe(403)
  })

  it.each([
    [{ rating: 0 }, 'Choose a rating from 1 to 5 stars.'],
    [{ rating: 6 }, 'Choose a rating from 1 to 5 stars.'],
    [{ rating: 4.5 }, 'Choose a rating from 1 to 5 stars.'],
    [{ rating: 5, body: 'x'.repeat(2001) }, 'Keep your review under 2,000 characters.'],
  ])('refuses the review %j', async (body, error) => {
    const { bob, ana, id } = await completed()
    await bob.agent.post(`/api/projects/${id}/complete`)
    const res = await ana.agent.post(`/api/projects/${id}/review`).send(body)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it('passes on other database errors', async () => {
    const { bob, ana, id } = await completed()
    await bob.agent.post(`/api/projects/${id}/complete`)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    breakDatabase('INSERT INTO reviews')
    expect((await ana.agent.post(`/api/projects/${id}/review`).send({ rating: 5 })).status).toBe(500)
    vi.restoreAllMocks()
  })
})

describe('GET /api/projects', () => {
  it("lists each side's projects: proposals first, then active, then the rest", async () => {
    const bob = await createBuilder({ businessName: 'Bob Builds' })
    const ana = await createClient({ name: 'Ana Lima' })
    const done = await hire(ana, bob, 3_000_000)
    await bob.agent.post(`/api/projects/${done}/complete`)
    const active = await activeProject(bob, ana, { title: 'Active one', contractAmount: 5_000_000 })
    await bob.agent.post(`/api/projects/${active}/stages`).send({ name: 'One' })
    const stages = (await bob.agent.post(`/api/projects/${active}/stages`).send({ name: 'Two' })).body.project.stages
    await bob.agent.put(`/api/stages/${stages[0].id}`).send({ status: 'done' })
    await bob.agent.post(`/api/projects/${active}/change-orders`).send({ title: 'Extra', description: 'More', amount: 100_000 })
    await bob.agent.post(`/api/projects/${active}/invoices`).send({ title: 'Deposit', amount: 500_000, dueDate: '2020-01-01' })
    const proposal = await propose(bob, ana.email, { title: 'Proposal' })
    await propose(bob, 'someone@example.com', { title: 'Invite', clientName: 'Sam Someone' })

    const forAna = (await ana.agent.get('/api/projects')).body.projects
    expect(forAna.map((p: { title: string }) => p.title)).toEqual(['Proposal', 'Active one', 'New kitchen'])
    expect(forAna[1]).toEqual({
      id: active,
      title: 'Active one',
      status: 'active',
      address: '1 Main St',
      currency: 'USD',
      startDate: '2026-12-01',
      createdAt: expect.any(Number),
      builder: { id: bob.user.id, name: bob.name, businessName: 'Bob Builds' },
      client: { id: ana.user.id, name: 'Ana Lima' },
      invitedClient: null,
      progress: { done: 1, total: 2 },
      money: { total: 5_000_000, invoiced: 500_000, paid: 0 },
      pendingChanges: 1,
      dueInvoices: 1,
      overdueInvoices: 1,
      waitingOnClient: 2,
    })
    expect(forAna[0]).toMatchObject({ id: proposal.id, waitingOnClient: 1 })

    const forBob = (await bob.agent.get('/api/projects')).body.projects
    expect(forBob.map((p: { title: string }) => p.title)).toEqual(['Invite', 'Proposal', 'Active one', 'New kitchen'])
    expect(forBob[0]).toMatchObject({ client: null, invitedClient: { name: 'Sam Someone', email: 'someone@example.com' } })
  })

  it('needs you to be logged in', async () => {
    expect((await newAgent().get('/api/projects')).status).toBe(401)
  })
})

describe('GET /api/projects/:id', () => {
  it("is 404 for people who aren't on the project", async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const id = await activeProject(bob, ana)
    for (const person of [await createClient(), await createBuilder()]) {
      const res = await person.agent.get(`/api/projects/${id}`)
      expect(res.status).toBe(404)
      expect(res.body.error).toBe("This project doesn't exist.")
    }
    expect((await ana.agent.get('/api/projects/nope')).status).toBe(404)
  })

  it("shows each side the other's contact details", async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    await ana.agent.put('/api/me').send({ name: ana.name, phone: '555-0100' })
    await bob.agent.put('/api/me').send({ name: bob.name, phone: '555-0199' })
    const id = await activeProject(bob, ana)
    expect((await bob.agent.get(`/api/projects/${id}`)).body.project.client).toMatchObject({ email: ana.email, phone: '555-0100' })
    expect((await ana.agent.get(`/api/projects/${id}`)).body.project.builder).toMatchObject({ email: bob.email, phone: '555-0199' })
  })
})
