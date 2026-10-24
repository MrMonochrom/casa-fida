import request from 'supertest'
import { expect, vi } from 'vitest'
import type { Role } from '../../shared/rules.ts'
import { app } from '../app.ts'
import { db } from '../db.ts'
import { outbox } from '../mailer.ts'

type Execute = (...args: unknown[]) => Promise<unknown>

/** The SQL of an execute() call, whether it was given as a string or as { sql, … }. */
const sqlOf = (query: unknown) => (typeof query === 'string' ? query : String((query as { sql?: unknown })?.sql ?? ''))

/**
 * Puts `wrap` around every statement run on the pool, and on every connection taken from it (used
 * by transactions). Undo with vi.restoreAllMocks().
 */
function interceptQueries(wrap: (sql: string, run: () => Promise<unknown>) => Promise<unknown>) {
  const patch = (target: object) => {
    const withExecute = target as { execute: Execute }
    const original = withExecute.execute.bind(target)
    vi.spyOn(withExecute, 'execute').mockImplementation((...args: unknown[]) =>
      wrap(sqlOf(args[0]), () => original(...args)),
    )
  }
  patch(db)
  const getConnection = db.getConnection.bind(db)
  vi.spyOn(db, 'getConnection').mockImplementation(async () => {
    const conn = await getConnection()
    patch(conn)
    return conn
  })
}

/** Makes statements starting with `sqlStart` fail; others run normally. Undo with vi.restoreAllMocks(). */
export function breakDatabase(sqlStart: string) {
  interceptQueries((sql, run) =>
    sql.trimStart().startsWith(sqlStart) ? Promise.reject(new Error('Simulated database failure')) : run(),
  )
}

/**
 * Makes reads whose SQL matches `pattern` return their rows as `change` alters them: as if another
 * request changed the data just after this one read it. For checking that writes don't trust what
 * was read. Undo with vi.restoreAllMocks().
 */
export function staleReads(pattern: RegExp, change: (row: Record<string, unknown>) => void) {
  interceptQueries(async (sql, run) => {
    const result = (await run()) as [unknown, unknown]
    if (pattern.test(sql) && Array.isArray(result[0])) for (const row of result[0]) change(row)
    return result
  })
}

export const PASSWORD = 'testpass123'

/** A browser-like client that keeps its login cookie between requests. */
export type Agent = ReturnType<typeof request.agent>

export function newAgent(): Agent {
  return request.agent(app)
}

/** Empties every table, so each test starts from nothing. Children first, because of foreign keys. */
export async function resetDb() {
  const tables = [
    'messages', 'conversations', 'reviews', 'invoices', 'change_orders', 'update_photos', 'updates', 'stages',
    'projects', 'quotes', 'jobs', 'builder_trades', 'builder_profiles', 'sessions', 'users',
  ]
  for (const table of tables) await db.query(`DELETE FROM ${table}`)
}

let counter = 0

/**
 * Signs up. Returns the logged-in agent, the new user and what was sent. The email address counts
 * as confirmed unless `verified` is false, and the confirmation email is taken out of the outbox,
 * so tests about other emails see only theirs.
 */
export async function signUp(
  account: Partial<{ name: string; email: string; password: string; role: Role; verified: boolean }> = {},
) {
  counter++
  const { verified = true, ...rest } = account
  const body = {
    name: `Person ${counter}`,
    email: `person${counter}@example.com`,
    password: PASSWORD,
    role: 'client' as Role,
    ...rest,
  }
  const agent = newAgent()
  const res = await agent.post('/api/signup').send(body)
  if (res.status !== 201) throw new Error(`Sign-up failed: ${res.status} ${JSON.stringify(res.body)}`)
  const email = body.email.trim().toLowerCase()
  const confirmation = outbox.findLastIndex((e) => e.to === email && e.text.includes('/verify-email?token='))
  if (confirmation !== -1) outbox.splice(confirmation, 1)
  if (verified) await db.execute('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [res.body.user.id])
  return { agent, user: { ...res.body.user, emailVerified: verified }, ...body }
}

export type Person = Awaited<ReturnType<typeof signUp>>

export const createClient = (account: Parameters<typeof signUp>[0] = {}) => signUp({ ...account, role: 'client' })

export function validBuilderProfile(overrides: Record<string, unknown> = {}) {
  return {
    businessName: 'Solid Builds',
    headline: 'Kitchens and extensions',
    about: 'We build things properly.',
    serviceArea: 'Denver, CO',
    yearsInBusiness: 10,
    licenseNumber: 'GC-1',
    insured: true,
    trades: ['kitchens', 'extensions'],
    ...overrides,
  }
}

/** Signs up as a builder and sets up a business profile. */
export async function createBuilder(profile: Record<string, unknown> = {}, account: Parameters<typeof signUp>[0] = {}) {
  const person = await signUp({ ...account, role: 'builder' })
  const res = await person.agent.put('/api/me/builder-profile').send(validBuilderProfile(profile))
  if (res.status !== 200) throw new Error(`Profile failed: ${res.status} ${JSON.stringify(res.body)}`)
  return { ...person, user: res.body.user }
}

export function validJob(overrides: Record<string, unknown> = {}) {
  return {
    title: 'New kitchen',
    description: 'Replace the cabinets and counters.',
    trade: 'kitchens',
    location: 'Denver, CO',
    budgetMin: 2_000_000,
    budgetMax: 3_000_000,
    timing: 'within_3_months',
    ...overrides,
  }
}

export async function postJob(client: Person, overrides: Record<string, unknown> = {}) {
  const res = await client.agent.post('/api/jobs').send(validJob(overrides))
  if (res.status !== 201) throw new Error(`Job failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.job as { id: number; title: string }
}

export async function sendQuote(builder: Person, jobId: number, overrides: Record<string, unknown> = {}) {
  const res = await builder.agent
    .put(`/api/jobs/${jobId}/quote`)
    .send({ amount: 2_500_000, weeks: 6, message: 'Everything included.', ...overrides })
  if (res.status !== 201 && res.status !== 200) throw new Error(`Quote failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.quote as { id: number; amount: number; status: string }
}

/** A client posts a job, the builder quotes and the client accepts: returns the active project's id. */
export async function hire(client: Person, builder: Person, amount = 10_000_000): Promise<number> {
  const job = await postJob(client)
  const quote = await sendQuote(builder, job.id, { amount })
  const res = await client.agent.post(`/api/quotes/${quote.id}/accept`)
  if (res.status !== 200) throw new Error(`Accept failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.projectId
}

export function validProposal(clientEmail: string, overrides: Record<string, unknown> = {}) {
  return {
    title: 'Bathroom remodel',
    description: 'New tile, vanity and shower.',
    address: '1 Main St',
    contractAmount: 2_000_000,
    startDate: '2026-12-01',
    clientName: 'Cleo Client',
    clientEmail,
    ...overrides,
  }
}

/** A builder sends a proposal. Returns the project as the builder sees it. */
export async function propose(builder: Person, clientEmail: string, overrides: Record<string, unknown> = {}) {
  const res = await builder.agent.post('/api/projects').send(validProposal(clientEmail, overrides))
  if (res.status !== 201) throw new Error(`Proposal failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.project
}

/** A builder proposes to a client with an account and the client accepts: returns the project's id. */
export async function activeProject(builder: Person, client: Person, overrides: Record<string, unknown> = {}) {
  const project = await propose(builder, client.email, overrides)
  const res = await client.agent.post(`/api/projects/${project.id}/accept`)
  expect(res.status).toBe(200)
  return project.id as number
}

/** A tiny but valid-looking JPEG: the server only checks the first bytes. */
export const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
