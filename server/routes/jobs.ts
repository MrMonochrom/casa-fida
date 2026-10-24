import express from 'express'
import type { Request, Response } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import {
  DESCRIPTION_MAX,
  PLACE_MAX,
  QUOTE_MESSAGE_MAX,
  QUOTE_WEEKS_MAX,
  TITLE_MAX,
  isJobTiming,
  isTrade,
} from '../../shared/rules.ts'
import { DEFAULT_CURRENCY, isCurrency } from '../../shared/money.ts'
import type { Currency } from '../../shared/money.ts'
import { PLAN_LIMITS } from '../../shared/plans.ts'
import { ensureConversation } from '../conversations.ts'
import { db, inTransaction, ms } from '../db.ts'
import { conflict, notFound } from '../errors.ts'
import type { Text } from '../i18n/index.ts'
import { publish } from '../events.ts'
import { notify, sendJobAlerts } from '../notifications.ts'
import { limits, tooManyAttempts } from '../rateLimit.ts'
import { me, requireRole, requireUser } from '../session.ts'
import { planOf, shortName, tradeCovered } from '../users.ts'
import type { UserRow } from '../users.ts'
import { amountFrom, badRequest, fail, idFrom, invalid, longText, text, wholeFrom } from '../validate.ts'

export const jobRoutes = express.Router()

const JOB_GONE: Text = (m) => m.jobs.goneOrClosed
const QUOTE_GONE: Text = (m) => m.quotes.gone

function readJob(body: Record<string, unknown>) {
  const title = text(body.title)
  const description = longText(body.description)
  const location = text(body.location)
  const trade = body.trade
  const timing = body.timing ?? 'flexible'
  const currency = body.currency ?? DEFAULT_CURRENCY

  if (!title || title.length > TITLE_MAX) return invalid((m) => m.jobs.enterTitle)
  if (!description) return invalid((m) => m.jobs.enterDescription)
  if (description.length > DESCRIPTION_MAX) {
    return invalid((m) => m.general.descriptionTooLong)
  }
  if (!isTrade(trade)) return invalid((m) => m.jobs.chooseTrade)
  if (!location || location.length > PLACE_MAX) return invalid((m) => m.jobs.enterLocation)
  if (!isJobTiming(timing)) return invalid((m) => m.jobs.chooseTiming)
  if (!isCurrency(currency)) return invalid((m) => m.general.chooseCurrency)

  const budgetMin = body.budgetMin == null ? null : amountFrom(body.budgetMin)
  const budgetMax = body.budgetMax == null ? null : amountFrom(body.budgetMax)
  if ((body.budgetMin != null && budgetMin === null) || (body.budgetMax != null && budgetMax === null)) {
    return invalid((m) => m.jobs.budgetPositive)
  }
  if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
    return invalid((m) => m.jobs.budgetBackwards)
  }
  return { title, description, location, trade, timing, currency, budgetMin, budgetMax }
}

interface JobRow extends RowDataPacket {
  id: number
  client_id: number
  client_name: string
  title: string
  description: string
  trade: string
  location: string
  currency: Currency
  budget_min: number | null
  budget_max: number | null
  timing: string
  status: 'open' | 'hired' | 'closed'
  created_at: number
  quote_count: number
  pending_quotes: number
  project_id: number | null
}

const JOB_SELECT = `
  SELECT j.id, j.client_id, u.name AS client_name, j.title, j.description, j.trade, j.location, j.currency,
         j.budget_min, j.budget_max, j.timing, j.status, ${ms('j.created_at')} AS created_at,
         (SELECT COUNT(*) FROM quotes q WHERE q.job_id = j.id AND q.status <> 'withdrawn') AS quote_count,
         (SELECT COUNT(*) FROM quotes q WHERE q.job_id = j.id AND q.status = 'pending') AS pending_quotes,
         (SELECT p.id FROM projects p WHERE p.job_id = j.id) AS project_id
  FROM jobs j JOIN users u ON u.id = j.client_id`

/** A job as its client sees it, or, with forBuilder, as builders do (the client's short name only). */
function toJob(row: JobRow, forBuilder: boolean) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    trade: row.trade,
    location: row.location,
    currency: row.currency,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    timing: row.timing,
    status: row.status,
    createdAt: Number(row.created_at),
    client: { id: row.client_id, name: forBuilder ? shortName(row.client_name) : row.client_name },
    quoteCount: Number(row.quote_count),
    pendingQuotes: forBuilder ? undefined : Number(row.pending_quotes),
    projectId: forBuilder ? undefined : row.project_id,
  }
}

interface QuoteRow extends RowDataPacket {
  id: number
  job_id: number
  builder_id: number
  amount: number
  weeks: number | null
  message: string
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn'
  created_at: number
  updated_at: number
  builder_name: string
  business_name: string
  service_area: string
  insured: number
  licensed: number
  rating: number | null
  review_count: number
  job_title: string
  job_location: string
  job_status: string
  job_trade: string
  currency: Currency
  project_id: number | null
}

const QUOTE_SELECT = `
  SELECT q.id, q.job_id, q.builder_id, q.amount, q.weeks, q.message, q.status,
         ${ms('q.created_at')} AS created_at, ${ms('q.updated_at')} AS updated_at,
         u.name AS builder_name, b.business_name, b.service_area, b.insured, b.license_number IS NOT NULL AS licensed,
         (SELECT AVG(r.rating) FROM reviews r WHERE r.builder_id = q.builder_id) AS rating,
         (SELECT COUNT(*) FROM reviews r WHERE r.builder_id = q.builder_id) AS review_count,
         j.title AS job_title, j.location AS job_location, j.status AS job_status, j.trade AS job_trade, j.currency,
         (SELECT p.id FROM projects p WHERE p.job_id = q.job_id AND p.builder_id = q.builder_id) AS project_id
  FROM quotes q
  JOIN jobs j ON j.id = q.job_id
  JOIN users u ON u.id = q.builder_id
  JOIN builder_profiles b ON b.user_id = q.builder_id`

function toQuote(row: QuoteRow) {
  return {
    id: row.id,
    jobId: row.job_id,
    // Always in the job's currency.
    amount: row.amount,
    currency: row.currency,
    weeks: row.weeks,
    message: row.message,
    status: row.status,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    builder: {
      id: row.builder_id,
      name: row.builder_name,
      businessName: row.business_name,
      serviceArea: row.service_area,
      insured: Boolean(row.insured),
      licensed: Boolean(row.licensed),
      rating: row.rating === null ? null : Math.round(Number(row.rating) * 10) / 10,
      reviewCount: Number(row.review_count),
    },
    job: { id: row.job_id, title: row.job_title, location: row.job_location, status: row.job_status, trade: row.job_trade },
    // The project this quote became, once it's accepted.
    projectId: row.project_id,
  }
}

async function loadJob(id: number | null): Promise<JobRow | null> {
  if (!id) return null
  const [rows] = await db.execute<JobRow[]>(`${JOB_SELECT} WHERE j.id = ?`, [id])
  return rows[0] ?? null
}

async function loadQuote(id: number | null): Promise<QuoteRow | null> {
  if (!id) return null
  const [rows] = await db.execute<QuoteRow[]>(`${QUOTE_SELECT} WHERE q.id = ?`, [id])
  return rows[0] ?? null
}

async function myQuoteOn(jobId: number, builderId: number) {
  const [rows] = await db.execute<QuoteRow[]>(`${QUOTE_SELECT} WHERE q.job_id = ? AND q.builder_id = ?`, [
    jobId,
    builderId,
  ])
  return rows[0] ? toQuote(rows[0]) : null
}

/** Everyone who quoted on a job (and hasn't withdrawn), to tell them it changed. */
async function quotingBuilders(jobId: number): Promise<number[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT builder_id FROM quotes WHERE job_id = ? AND status <> 'withdrawn'",
    [jobId],
  )
  return rows.map((r) => r.builder_id as number)
}

// ---------- Clients: posting and managing jobs ----------

// Posts a job. Builders on Pro in its trade hear about it straight away, but only from clients who
// have confirmed their address (otherwise once they do), and a client can post only so many a day.
jobRoutes.post('/jobs', requireRole('client'), async (req, res) => {
  const client = me(res)
  const input = readJob(req.body ?? {})
  if ('error' in input) return badRequest(res, input.error)
  const key = String(client.id)
  const wait = limits.jobsPerClientPerDay.retryAfter(key)
  if (wait) return tooManyAttempts(res, wait)
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO jobs (client_id, title, description, trade, location, currency, budget_min, budget_max, timing)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      client.id,
      input.title,
      input.description,
      input.trade,
      input.location,
      input.currency,
      input.budgetMin,
      input.budgetMax,
      input.timing,
    ],
  )
  limits.jobsPerClientPerDay.hit(key)
  const job = (await loadJob(result.insertId))!
  if (client.email_verified_at) sendJobAlerts(job)
  res.status(201).json({ job: toJob(job, false) })
})

// Your jobs, newest first.
jobRoutes.get('/jobs/mine', requireRole('client'), async (_req, res) => {
  const [rows] = await db.execute<JobRow[]>(`${JOB_SELECT} WHERE j.client_id = ? ORDER BY j.created_at DESC, j.id DESC`, [
    me(res).id,
  ])
  res.json({ jobs: rows.map((r) => toJob(r, false)) })
})

/** The job, if it's this client's own. */
async function ownJob(req: Request, res: Response) {
  const job = await loadJob(idFrom(req.params.id))
  if (!job || job.client_id !== me(res).id) throw notFound((m) => m.jobs.gone)
  return job
}

// Changes a job while it's still open.
jobRoutes.put('/jobs/:id', requireRole('client'), async (req, res) => {
  const job = await ownJob(req, res)
  if (job.status !== 'open') return fail(res, 409, (m) => m.jobs.onlyOpenChange)
  const input = readJob({ ...req.body, currency: req.body?.currency ?? job.currency })
  if ('error' in input) return badRequest(res, input.error)
  // Quotes are in the job's currency, so it stays once any have come in.
  if (input.currency !== job.currency && Number(job.quote_count) > 0) {
    return fail(res, 409, (m) => m.jobs.currencyLocked)
  }
  // Only while it's open, checked as it's saved: a builder may have been hired a moment ago.
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE jobs SET title = ?, description = ?, trade = ?, location = ?, currency = ?, budget_min = ?, budget_max = ?,
                     timing = ?
     WHERE id = ? AND status = 'open'`,
    [
      input.title,
      input.description,
      input.trade,
      input.location,
      input.currency,
      input.budgetMin,
      input.budgetMax,
      input.timing,
      job.id,
    ],
  )
  if (result.affectedRows === 0) throw conflict((m) => m.jobs.onlyOpenChange)
  for (const builderId of await quotingBuilders(job.id)) publish(builderId, { type: 'job', jobId: job.id })
  res.json({ job: toJob((await loadJob(job.id))!, false) })
})

// Stops taking quotes. Quotes still waiting for an answer are declined.
jobRoutes.post('/jobs/:id/close', requireRole('client'), async (req, res) => {
  const job = await ownJob(req, res)
  if (job.status !== 'open') return fail(res, 409, (m) => m.jobs.alreadyClosed)
  const builders = await quotingBuilders(job.id)
  await inTransaction(async (conn) => {
    // Only while it's open: a builder may have been hired a moment ago, in another window.
    const [closed] = await conn.execute<ResultSetHeader>(
      "UPDATE jobs SET status = 'closed' WHERE id = ? AND status = 'open'",
      [job.id],
    )
    if (closed.affectedRows === 0) throw conflict((m) => m.jobs.alreadyTaken)
    await conn.execute("UPDATE quotes SET status = 'declined' WHERE job_id = ? AND status = 'pending'", [job.id])
  })
  for (const builderId of builders) publish(builderId, { type: 'job', jobId: job.id })
  res.json({ job: toJob((await loadJob(job.id))!, false) })
})

// ---------- Builders: finding work ----------

// Open jobs, newest first. ?trade=<key> for one trade, or ?trade=mine for the trades you offer.
jobRoutes.get('/jobs', requireRole('builder'), async (req, res) => {
  const builderId = me(res).id
  const trade = text(req.query.trade)
  let filter = ''
  const params: (string | number)[] = []
  if (trade === 'mine') {
    filter = `AND j.trade IN (SELECT t.trade FROM builder_trades t JOIN users b ON b.id = t.user_id
                              WHERE t.user_id = ? AND ${tradeCovered('t.', 'b.')})`
    params.push(builderId)
  } else if (trade) {
    if (!isTrade(trade)) return badRequest(res, (m) => m.builders.unknownTrade)
    filter = 'AND j.trade = ?'
    params.push(trade)
  }
  const [rows] = await db.execute<JobRow[]>(
    `${JOB_SELECT} WHERE j.status = 'open' ${filter} ORDER BY j.created_at DESC, j.id DESC LIMIT 200`,
    params,
  )
  const [mine] = await db.execute<RowDataPacket[]>(
    "SELECT job_id, id, amount, status FROM quotes WHERE builder_id = ? AND status <> 'withdrawn'",
    [builderId],
  )
  const myQuotes = new Map(mine.map((q) => [q.job_id as number, { id: q.id, amount: q.amount, status: q.status }]))
  res.json({ jobs: rows.map((r) => ({ ...toJob(r, true), myQuote: myQuotes.get(r.id) ?? null })) })
})

// Your quotes, newest first, with the job each is for.
jobRoutes.get('/quotes/mine', requireRole('builder'), async (_req, res) => {
  const [rows] = await db.execute<QuoteRow[]>(
    `${QUOTE_SELECT} WHERE q.builder_id = ? ORDER BY q.updated_at DESC, q.id DESC`,
    [me(res).id],
  )
  res.json({ quotes: rows.map(toQuote) })
})

// One job. Its client sees every quote; a builder sees the job while it's open (or once they've
// quoted on it), with their own quote.
jobRoutes.get('/jobs/:id', requireUser, async (req, res) => {
  const user = me(res)
  const job = await loadJob(idFrom(req.params.id))
  if (job && user.role === 'client' && job.client_id === user.id) {
    const [quotes] = await db.execute<QuoteRow[]>(
      `${QUOTE_SELECT} WHERE q.job_id = ? AND q.status <> 'withdrawn'
       ORDER BY q.status = 'accepted' DESC, q.status = 'pending' DESC, q.amount, q.id`,
      [job.id],
    )
    res.json({ job: toJob(job, false), quotes: quotes.map(toQuote) })
    return
  }
  if (job && user.role === 'builder') {
    const myQuote = await myQuoteOn(job.id, user.id)
    if (job.status === 'open' || (myQuote && myQuote.status !== 'withdrawn')) {
      res.json({ job: toJob(job, true), myQuote })
      return
    }
  }
  fail(res, 404, (m) => m.jobs.goneOrClosed)
})

function readQuote(body: Record<string, unknown>) {
  const amount = amountFrom(body.amount)
  const message = longText(body.message)
  if (amount === null) return invalid((m) => m.quotes.enterPrice)
  let weeks: number | null = null
  if (body.weeks != null && body.weeks !== '') {
    weeks = wholeFrom(body.weeks, 1, QUOTE_WEEKS_MAX)
    if (weeks === null) return invalid((m) => m.quotes.weeksWhole)
  }
  if (!message) return invalid((m) => m.quotes.enterMessage)
  if (message.length > QUOTE_MESSAGE_MAX) {
    return invalid((m) => m.quotes.messageTooLong)
  }
  return { amount, weeks, message }
}

async function hasBuilderProfile(user: UserRow) {
  const [rows] = await db.execute<RowDataPacket[]>('SELECT 1 FROM builder_profiles WHERE user_id = ?', [user.id])
  return rows.length > 0
}

// Sends your quote for an open job, or changes the one you sent.
jobRoutes.put('/jobs/:id/quote', requireRole('builder'), async (req, res) => {
  const builder = me(res)
  if (!(await hasBuilderProfile(builder))) return fail(res, 409, (m) => m.quotes.needProfile)
  const job = await loadJob(idFrom(req.params.id))
  if (!job || job.status !== 'open') return fail(res, 404, JOB_GONE)
  // The app sends the currency the builder saw, in case the client changed it since.
  if (req.body?.currency !== undefined && req.body.currency !== job.currency) {
    return fail(res, 409, (m) => m.quotes.currencyChanged)
  }
  const input = readQuote(req.body ?? {})
  if ('error' in input) return badRequest(res, input.error)

  const existing = await myQuoteOn(job.id, builder.id)
  if (existing?.status === 'declined') return fail(res, 409, (m) => m.quotes.declined)
  // A new quote emails the client, so only from builders who have confirmed their own address,
  // and only so many a day.
  const isNew = !existing || existing.status === 'withdrawn'
  const key = String(builder.id)
  if (isNew) {
    if (!builder.email_verified_at) return fail(res, 409, (m) => m.quotes.confirmEmailFirst)
    const max = PLAN_LIMITS[await planOf(builder.id)].newQuotesPerDay
    const wait = limits.newQuotesPerBuilderPerDay.retryAfter(key, max)
    if (wait) return tooManyAttempts(res, wait)
  }
  await inTransaction(async (conn) => {
    // What the client can change is checked again as the quote is saved, with the job and then the
    // quote locked (the order accepting a quote locks them in): since the checks above, they may
    // have closed the job, hired someone, changed its currency or declined this quote.
    const [jobs] = await conn.execute<RowDataPacket[]>(
      'SELECT status, currency FROM jobs WHERE id = ? FOR UPDATE',
      [job.id],
    )
    if (jobs[0]?.status !== 'open') throw notFound(JOB_GONE)
    if (req.body?.currency !== undefined && req.body.currency !== jobs[0].currency) {
      throw conflict((m) => m.quotes.currencyChanged)
    }
    const [quotes] = await conn.execute<RowDataPacket[]>(
      'SELECT status FROM quotes WHERE job_id = ? AND builder_id = ? FOR UPDATE',
      [job.id, builder.id],
    )
    if (quotes[0]?.status === 'declined') throw conflict((m) => m.quotes.declined)
    await conn.execute(
      `INSERT INTO quotes (job_id, builder_id, amount, weeks, message) VALUES (?, ?, ?, ?, ?) AS new
       ON DUPLICATE KEY UPDATE amount = new.amount, weeks = new.weeks, message = new.message, status = 'pending'`,
      [job.id, builder.id, input.amount, input.weeks, input.message],
    )
  })
  publish(job.client_id, { type: 'job', jobId: job.id })
  const quote = (await myQuoteOn(job.id, builder.id))!
  if (isNew) {
    limits.newQuotesPerBuilderPerDay.hit(key)
    notify(
      job.client_id,
      'quotes',
      (m) => m.newQuote(quote.builder.businessName, job.title, quote.amount, job.currency),
      `/jobs/${job.id}`,
    )
  }
  res.status(existing ? 200 : 201).json({ quote })
})

// Withdraws your quote while the client hasn't answered it.
jobRoutes.delete('/jobs/:id/quote', requireRole('builder'), async (req, res) => {
  const builder = me(res)
  const jobId = idFrom(req.params.id)
  const quote = jobId ? await myQuoteOn(jobId, builder.id) : null
  if (!quote || quote.status === 'withdrawn') return fail(res, 404, QUOTE_GONE)
  // Only while it's waiting for an answer, checked as it's saved: the client may have just answered.
  const [result] = await db.execute<ResultSetHeader>(
    "UPDATE quotes SET status = 'withdrawn' WHERE id = ? AND status = 'pending'",
    [quote.id],
  )
  if (result.affectedRows === 0) throw conflict((m) => m.quotes.alreadyAnswered)
  const job = (await loadJob(jobId))!
  publish(job.client_id, { type: 'job', jobId: job.id })
  res.status(204).end()
})

/** A quote on one of this client's jobs. */
async function quoteForClient(req: Request, res: Response) {
  const quote = await loadQuote(idFrom(req.params.id))
  const job = quote ? await loadJob(quote.job_id) : null
  if (!quote || !job || job.client_id !== me(res).id || quote.status === 'withdrawn') throw notFound(QUOTE_GONE)
  return { quote, job }
}

// Hires the builder: accepts their quote, declines the others, closes the job and starts the project.
jobRoutes.post('/quotes/:id/accept', requireRole('client'), async (req, res) => {
  const client = me(res)
  const { quote, job } = await quoteForClient(req, res)
  const others = (await quotingBuilders(job.id)).filter((id) => id !== quote.builder_id)

  const projectId = await inTransaction(async (conn) => {
    const [jobs] = await conn.execute<RowDataPacket[]>('SELECT status FROM jobs WHERE id = ? FOR UPDATE', [job.id])
    if (jobs[0].status !== 'open') throw conflict((m) => m.jobs.alreadyTaken)
    const [quotes] = await conn.execute<RowDataPacket[]>('SELECT status FROM quotes WHERE id = ? FOR UPDATE', [quote.id])
    if (quotes[0].status !== 'pending') throw conflict((m) => m.quotes.noLongerPending)

    await conn.execute("UPDATE quotes SET status = 'accepted' WHERE id = ?", [quote.id])
    await conn.execute("UPDATE quotes SET status = 'declined' WHERE job_id = ? AND id <> ? AND status = 'pending'", [
      job.id,
      quote.id,
    ])
    await conn.execute("UPDATE jobs SET status = 'hired' WHERE id = ?", [job.id])
    const [project] = await conn.execute<ResultSetHeader>(
      `INSERT INTO projects (builder_id, client_id, client_name, client_email, title, description, address,
                             currency, contract_amount, status, job_id, accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW())`,
      [
        quote.builder_id,
        client.id,
        client.name,
        client.email,
        job.title,
        job.description,
        job.location,
        job.currency,
        quote.amount,
        job.id,
      ],
    )
    await ensureConversation(client.id, quote.builder_id, conn)
    return project.insertId
  })

  publish(quote.builder_id, { type: 'job', jobId: job.id })
  publish(quote.builder_id, { type: 'project', projectId })
  notify(quote.builder_id, 'quotes', (m) => m.quoteAccepted(job.title), `/projects/${projectId}`)
  for (const builderId of others) publish(builderId, { type: 'job', jobId: job.id })
  res.json({ projectId })
})

// Turns a quote down. The job stays open for other quotes.
jobRoutes.post('/quotes/:id/decline', requireRole('client'), async (req, res) => {
  const { quote } = await quoteForClient(req, res)
  // Only while it's waiting for an answer, checked as it's saved: it may have been accepted a
  // moment ago, in another window.
  const [result] = await db.execute<ResultSetHeader>(
    "UPDATE quotes SET status = 'declined' WHERE id = ? AND status = 'pending'",
    [quote.id],
  )
  if (result.affectedRows === 0) throw conflict((m) => m.quotes.noLongerPending)
  publish(quote.builder_id, { type: 'job', jobId: quote.job_id })
  res.json({ quote: toQuote((await loadQuote(quote.id))!) })
})
