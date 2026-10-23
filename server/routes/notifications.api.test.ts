import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db.ts'
import { subscribe } from '../events.ts'
import { outbox } from '../mailer.ts'
import { notificationsSent, sendOverdueReminders } from '../notifications.ts'
import { limits } from '../rateLimit.ts'
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

/** The emails sent to someone, once the ones still going out have gone. */
async function emailsTo(person: Person) {
  await notificationsSent()
  return outbox.filter((e) => e.to === person.email)
}

/** Uses the app once in a language, the way a browser with that language chosen would. */
async function useAppIn(person: Person, language: string) {
  const login = await request(app).post('/api/login').send({ email: person.email, password: PASSWORD })
  const session = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0]
  await request(app).get('/api/projects').set('Cookie', `${session}; cf_lang=${language}`)
}

describe('quote emails', () => {
  it('tell a client about a new quote, in the language they use the app in', async () => {
    const ana = await createClient()
    const bob = await createBuilder({ businessName: 'Bob Builds' })
    await useAppIn(ana, 'ro')
    const job = await postJob(ana, { title: 'Bucătărie', currency: 'EUR' })
    await sendQuote(bob, job.id, { amount: 1_250_000 })

    const [email] = await emailsTo(ana)
    expect(email.subject).toBe('Ofertă nouă pentru „Bucătărie”')
    expect(email.text.replace(/\s/g, ' ')).toContain('Bob Builds v-a trimis o ofertă de 12.500 € pentru „Bucătărie”.')
    expect(email.text).toContain(`http://localhost:5174/jobs/${job.id}`)
    expect(email.text).toContain('http://localhost:5174/account')
  })

  it("don't come again when a builder changes their quote", async () => {
    const ana = await createClient()
    const bob = await createBuilder()
    const job = await postJob(ana)
    await sendQuote(bob, job.id)
    await sendQuote(bob, job.id, { amount: 2_400_000 })
    expect(await emailsTo(ana)).toHaveLength(1)
  })

  it('tell a builder their quote was accepted', async () => {
    const ana = await createClient()
    const bob = await createBuilder()
    const job = await postJob(ana, { title: 'New kitchen' })
    const quote = await sendQuote(bob, job.id)
    const { projectId } = (await ana.agent.post(`/api/quotes/${quote.id}/accept`)).body
    const [email] = await emailsTo(bob)
    expect(email.subject).toBe('Your quote was accepted: New kitchen')
    expect(email.text).toContain(`/projects/${projectId}`)
  })

  it('need the builder to have confirmed their address, and stop at 30 new quotes a day', async () => {
    const ana = await createClient()
    const job = await postJob(ana)
    const unconfirmed = await createBuilder({}, { verified: false })
    const res = await unconfirmed.agent.put(`/api/jobs/${job.id}/quote`).send({ amount: 100, message: 'Hi.' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Confirm your email address before sending quotes. We sent you a link.')

    vi.stubEnv('RATE_LIMITS', 'on')
    const bob = await createBuilder()
    for (let i = 0; i < 30; i++) limits.newQuotesPerBuilderPerDay.hit(String(bob.user.id))
    expect((await bob.agent.put(`/api/jobs/${job.id}/quote`).send({ amount: 100, message: 'Hi.' })).status).toBe(429)
    vi.unstubAllEnvs()
  })
})

describe('project emails', () => {
  it('tell a builder their proposal was accepted or declined', async () => {
    const ana = await createClient({ email: 'ana@example.com' })
    const bob = await createBuilder()
    const yes = await propose(bob, 'ana@example.com', { title: 'Deck' })
    const no = await propose(bob, 'ana@example.com', { title: 'Shed' })
    await ana.agent.post(`/api/projects/${yes.id}/accept`)
    await ana.agent.post(`/api/projects/${no.id}/decline`)
    expect((await emailsTo(bob)).map((e) => e.subject)).toEqual(['Proposal accepted: Deck', 'Proposal declined: Shed'])
  })

  it('tell a client about a change order, and the builder about the answer', async () => {
    const ana = await createClient()
    const bob = await createBuilder({ businessName: 'Bob Builds' })
    const id = await activeProject(bob, ana, { title: 'Bathroom' })
    await bob.agent.post(`/api/projects/${id}/change-orders`).send({ title: 'Heated floor', description: 'Under the tiles.', amount: 180_000 })
    const toAna = (await emailsTo(ana)).find((e) => e.subject.startsWith('Change'))!
    expect(toAna.subject).toBe('Change to approve: Heated floor')
    expect(toAna.text).toContain('Bob Builds sent a change order on “Bathroom”: “Heated floor”, +$1,800.')

    const change = (await ana.agent.get(`/api/projects/${id}`)).body.project.changeOrders[0]
    await ana.agent.post(`/api/change-orders/${change.id}/approve`)
    const toBob = (await emailsTo(bob)).find((e) => e.subject.startsWith('Change'))!
    expect(toBob.subject).toBe('Change approved: Heated floor')
    expect(toBob.text).toContain(`/projects/${id}?tab=money`)
  })

  it('send a client each invoice, and remind them once when it becomes overdue', async () => {
    const ana = await createClient()
    const bob = await createBuilder({ businessName: 'Bob Builds' })
    const id = await activeProject(bob, ana, { title: 'Bathroom', currency: 'MDL' })
    await bob.agent.post(`/api/projects/${id}/invoices`).send({ title: 'Deposit', amount: 500_000, dueDate: '2026-12-01' })
    await bob.agent.post(`/api/projects/${id}/invoices`).send({ title: 'Tiling', amount: 300_000, dueDate: '2020-01-15' })
    const sent = (await emailsTo(ana)).filter((e) => e.subject.startsWith('Invoice'))
    expect(sent.map((e) => e.subject)).toEqual(['Invoice #1 from Bob Builds', 'Invoice #2 from Bob Builds'])
    expect(sent[0].text.replace(/\s/g, ' ')).toContain('Bob Builds sent invoice #1 for “Bathroom”: MDL 5,000, due Dec 1, 2026.')

    await sendOverdueReminders()
    await sendOverdueReminders()
    const reminders = (await emailsTo(ana)).filter((e) => e.subject.includes('overdue'))
    expect(reminders.map((e) => e.subject)).toEqual(['Invoice #2 is overdue'])
  })

  it('tell a client the project is completed, and ask for a review', async () => {
    const ana = await createClient()
    const bob = await createBuilder({ businessName: 'Bob Builds' })
    const id = await activeProject(bob, ana, { title: 'Bathroom' })
    await bob.agent.post(`/api/projects/${id}/complete`)
    const email = (await emailsTo(ana)).at(-1)!
    expect(email.subject).toBe('Bathroom is completed')
    expect(email.text).toContain('You can leave a review.')
  })
})

describe('message emails', () => {
  async function talking() {
    const ana = await createClient()
    const bob = await createBuilder({ businessName: 'Bob Builds' })
    const conversation = (await ana.agent.post('/api/conversations').send({ userId: bob.user.id })).body.conversation
    const say = (person: Person, text: string) => person.agent.post(`/api/conversations/${conversation.id}/messages`).send({ text })
    return { ana, bob, conversation, say }
  }

  it('tell someone away about the first message they haven’t read, without the message itself', async () => {
    const { ana, bob, conversation, say } = await talking()
    await say(ana, 'My private question')
    await say(ana, 'And another one')
    const sent = await emailsTo(bob)
    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toBe(`New message from ${ana.name}`)
    expect(sent[0].text).toContain(`/messages/${conversation.id}`)
    expect(sent[0].text).not.toContain('private question')

    // Once Bob has read them, the next message is news again.
    await bob.agent.get(`/api/conversations/${conversation.id}/messages`)
    await say(ana, 'Hello again')
    expect(await emailsTo(bob)).toHaveLength(2)
  })

  it("aren't sent while the person has the app open", async () => {
    const { ana, bob, say } = await talking()
    const stop = subscribe(bob.user.id, () => {})
    await say(ana, 'Hi')
    expect(await emailsTo(bob)).toHaveLength(0)
    stop()
  })

  it('come from builders by their business name', async () => {
    const { ana, bob, say } = await talking()
    await say(bob, 'Hi Ana')
    expect((await emailsTo(ana))[0].subject).toBe('New message from Bob Builds')
  })
})

describe('who gets emails', () => {
  it('follows what each person turned off in Account', async () => {
    const ana = await createClient()
    const bob = await createBuilder()
    const res = await ana.agent.put('/api/me/notifications').send({ quotes: false, projects: true, messages: true })
    expect(res.body.user.notifications).toEqual({ quotes: false, projects: true, messages: true })
    const job = await postJob(ana)
    await sendQuote(bob, job.id)
    expect(await emailsTo(ana)).toHaveLength(0)
  })

  it('includes a client who joined from the invite in a proposal email', async () => {
    const bob = await createBuilder({ businessName: 'Bob Builds' })
    const project = await propose(bob, 'ana@example.com')
    const token = decodeURIComponent(/\/invite\?token=(\S+)/.exec(outbox.at(-1)!.text)![1])
    const ana = newAgent()
    await ana.post('/api/signup').send({ name: 'Ana', email: 'ana@example.com', password: PASSWORD, role: 'client' })
    await ana.post('/api/invites/claim').send({ token })
    await ana.post(`/api/projects/${project.id}/accept`)

    await bob.agent.post(`/api/projects/${project.id}/invoices`).send({ title: 'Deposit', amount: 500_000, dueDate: '2026-12-01' })
    await notificationsSent()
    expect(outbox.filter((e) => e.to === 'ana@example.com').map((e) => e.subject)).toContain('Invoice #1 from Bob Builds')
  })

  it('is only people who have confirmed their address', async () => {
    const ana = await createClient()
    await db.execute('UPDATE users SET email_verified_at = NULL WHERE id = ?', [ana.user.id])
    const bob = await createBuilder()
    const job = await postJob(ana)
    await sendQuote(bob, job.id)
    expect(await emailsTo(ana)).toHaveLength(0)
  })
})
