import express from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { Language } from '../../shared/languages.ts'
import { DEFAULT_CURRENCY, isCurrency } from '../../shared/money.ts'
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  PLACE_MAX,
  REVIEW_MAX,
  STAGES_MAX,
  STAGE_NAME_MAX,
  TITLE_MAX,
} from '../../shared/rules.ts'
import { hashToken, newSessionToken } from '../auth.ts'
import { conversationBetween, ensureConversation } from '../conversations.ts'
import { db, inTransaction, ms } from '../db.ts'
import { conflict, notFound } from '../errors.ts'
import { languageOf, messagesIn } from '../i18n/index.ts'
import type { Text } from '../i18n/index.ts'
import { publish } from '../events.ts'
import { appUrl, sendEmail } from '../mailer.ts'
import { confirmEmail } from '../verification.ts'
import { notify } from '../notifications.ts'
import { loadProject, moneyOf, projectAs, projectFor, projectSelect } from '../projects.ts'
import type { ProjectRow, ProjectStatus, Side } from '../projects.ts'
import { limits, tooManyAttempts } from '../rateLimit.ts'
import { me, requireRole, requireUser } from '../session.ts'
import type { UserRow } from '../users.ts'
import { amountFrom, badRequest, dateFrom, fail, invalid, isEmail, longText, text, wholeFrom } from '../validate.ts'

export const projectRoutes = express.Router()

// ---------- Reading projects ----------

interface StageRow extends RowDataPacket {
  id: number
  name: string
  status: 'todo' | 'in_progress' | 'done'
  position: number
}

export async function stagesOf(projectId: number) {
  const [rows] = await db.execute<StageRow[]>(
    'SELECT id, name, status, position FROM stages WHERE project_id = ? ORDER BY position, id',
    [projectId],
  )
  return rows.map((r) => ({ id: r.id, name: r.name, status: r.status }))
}

async function changeOrdersOf(projectId: number) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, title, description, amount, days, status, ${ms('created_at')} AS created_at, ${ms('decided_at')} AS decided_at
     FROM change_orders WHERE project_id = ? ORDER BY created_at DESC, id DESC`,
    [projectId],
  )
  return rows.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    description: r.description as string,
    amount: r.amount as number,
    days: r.days as number,
    status: r.status as string,
    createdAt: Number(r.created_at),
    decidedAt: r.decided_at === null ? null : Number(r.decided_at),
  }))
}

async function invoicesOf(projectId: number) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, number, title, amount, due_date, status, ${ms('created_at')} AS created_at, ${ms('paid_at')} AS paid_at,
            status = 'due' AND due_date < CURDATE() AS overdue
     FROM invoices WHERE project_id = ? ORDER BY number`,
    [projectId],
  )
  return rows.map((r) => ({
    id: r.id as number,
    number: r.number as number,
    title: r.title as string,
    amount: r.amount as number,
    dueDate: r.due_date as string,
    status: r.status as string,
    overdue: Boolean(r.overdue),
    createdAt: Number(r.created_at),
    paidAt: r.paid_at === null ? null : Number(r.paid_at),
  }))
}

async function reviewOf(projectId: number) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, rating, body, ${ms('created_at')} AS created_at FROM reviews WHERE project_id = ?`,
    [projectId],
  )
  const r = rows[0]
  return r ? { id: r.id as number, rating: r.rating as number, body: r.body as string, createdAt: Number(r.created_at) } : null
}

/** The accepted quote a project started from, if it came from a job. */
async function quoteOf(project: ProjectRow) {
  if (!project.job_id) return null
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT weeks, message FROM quotes WHERE job_id = ? AND builder_id = ? AND status = 'accepted'",
    [project.job_id, project.builder_id],
  )
  return rows[0] ? { jobId: project.job_id, weeks: rows[0].weeks as number | null, message: rows[0].message as string } : null
}

/**
 * A client's own name, email and phone number are for builders they work with. A builder who has
 * only sent a proposal (or had one declined) sees just the name and email they typed themselves,
 * so a proposal can't be used to look up who has an account and how to call them.
 */
const builderMaySeeClient = (status: ProjectStatus) => status === 'active' || status === 'completed'

function clientAsSeenBy(project: ProjectRow, side: Side) {
  if (side === 'client' || builderMaySeeClient(project.status)) {
    return { id: project.client_id!, name: project.client_user_name!, email: project.client_user_email!, phone: project.client_phone }
  }
  return { id: project.client_id!, name: project.client_name, email: project.client_email, phone: null }
}

/** Everything on a project page, for either side. */
export async function projectDetail(project: ProjectRow, side: Side) {
  const linked = project.client_id !== null
  const [stages, changeOrders, invoices, review, money, fromQuote, conversationId] = await Promise.all([
    stagesOf(project.id),
    changeOrdersOf(project.id),
    invoicesOf(project.id),
    reviewOf(project.id),
    moneyOf(project),
    quoteOf(project),
    linked ? conversationBetween(project.client_id!, project.builder_id) : Promise.resolve(null),
  ])
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    address: project.address,
    status: project.status,
    currency: project.currency,
    startDate: project.start_date,
    createdAt: Number(project.created_at),
    acceptedAt: project.accepted_at === null ? null : Number(project.accepted_at),
    completedAt: project.completed_at === null ? null : Number(project.completed_at),
    myRole: side,
    builder: {
      id: project.builder_id,
      name: project.builder_name,
      businessName: project.business_name,
      email: project.builder_email,
      phone: project.builder_phone,
    },
    client: linked ? clientAsSeenBy(project, side) : null,
    // Who the proposal was sent to, until they have an account.
    invitedClient: linked ? null : { name: project.client_name, email: project.client_email },
    money,
    stages,
    changeOrders,
    invoices,
    review,
    fromQuote,
    conversationId,
  }
}

interface SummaryRow extends ProjectRow {
  stages_done: number
  stages_total: number
  pending_changes: number
  due_invoices: number
  overdue_invoices: number
  changes: number
  invoiced: number
  paid: number
}

// Your projects: proposals and active ones first, then the rest, newest first.
projectRoutes.get('/projects', requireUser, async (_req, res) => {
  const user = me(res)
  const column = user.role === 'builder' ? 'p.builder_id' : 'p.client_id'
  const [rows] = await db.execute<SummaryRow[]>(
    `${projectSelect(
      `, (SELECT COUNT(*) FROM stages s WHERE s.project_id = p.id AND s.status = 'done') AS stages_done,
         (SELECT COUNT(*) FROM stages s WHERE s.project_id = p.id) AS stages_total,
         (SELECT COUNT(*) FROM change_orders c WHERE c.project_id = p.id AND c.status = 'pending') AS pending_changes,
         (SELECT COUNT(*) FROM invoices i WHERE i.project_id = p.id AND i.status = 'due') AS due_invoices,
         (SELECT COUNT(*) FROM invoices i WHERE i.project_id = p.id AND i.status = 'due' AND i.due_date < CURDATE()) AS overdue_invoices,
         (SELECT COALESCE(SUM(c.amount), 0) FROM change_orders c WHERE c.project_id = p.id AND c.status = 'approved') AS changes,
         (SELECT COALESCE(SUM(i.amount), 0) FROM invoices i WHERE i.project_id = p.id AND i.status <> 'void') AS invoiced,
         (SELECT COALESCE(SUM(i.amount), 0) FROM invoices i WHERE i.project_id = p.id AND i.status = 'paid') AS paid`,
    )}
     WHERE ${column} = ?
     ORDER BY FIELD(p.status, 'proposed', 'active', 'completed', 'declined'), p.created_at DESC, p.id DESC`,
    [user.id],
  )
  res.json({
    projects: rows.map((r) => {
      const total = r.contract_amount + Number(r.changes)
      const pendingChanges = Number(r.pending_changes)
      const dueInvoices = Number(r.due_invoices)
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        address: r.address,
        currency: r.currency,
        startDate: r.start_date,
        createdAt: Number(r.created_at),
        builder: { id: r.builder_id, name: r.builder_name, businessName: r.business_name },
        client: r.client_id
          ? {
              id: r.client_id,
              name: user.role === 'client' || builderMaySeeClient(r.status) ? r.client_user_name! : r.client_name,
            }
          : null,
        invitedClient: r.client_id ? null : { name: r.client_name, email: r.client_email },
        progress: { done: Number(r.stages_done), total: Number(r.stages_total) },
        money: { total, invoiced: Number(r.invoiced), paid: Number(r.paid) },
        pendingChanges,
        dueInvoices,
        overdueInvoices: Number(r.overdue_invoices),
        // Things only the client can move forward: a proposal to answer, changes to approve, invoices to pay.
        waitingOnClient: (r.status === 'proposed' ? 1 : 0) + pendingChanges + dueInvoices,
      }
    }),
  })
})

projectRoutes.get('/projects/:id', requireUser, async (req, res) => {
  const { project, side } = await projectFor(res, req.params.id)
  res.json({ project: await projectDetail(project, side) })
})

// ---------- Proposals ----------

function readDetails(body: Record<string, unknown>) {
  const title = text(body.title)
  const description = longText(body.description)
  const address = text(body.address)
  if (!title || title.length > TITLE_MAX) return invalid((m) => m.projects.enterTitle)
  if (!description) return invalid((m) => m.projects.enterDescription)
  if (description.length > DESCRIPTION_MAX) {
    return invalid((m) => m.general.descriptionTooLong)
  }
  if (address.length > PLACE_MAX) return invalid((m) => m.projects.addressTooLong)
  let startDate: string | null = null
  if (body.startDate) {
    startDate = dateFrom(body.startDate)
    if (!startDate) return invalid((m) => m.projects.enterStartDate)
  }
  return { title, description, address, startDate }
}

function readStageNames(value: unknown) {
  if (value == null) return { stages: [] as string[] }
  if (!Array.isArray(value)) return invalid((m) => m.stages.notAList)
  const stages = [...new Set(value.map(text).filter(Boolean))]
  if (stages.length > STAGES_MAX) return invalid((m) => m.stages.tooMany)
  if (stages.some((s) => s.length > STAGE_NAME_MAX)) return invalid((m) => m.stages.nameTooLong)
  return { stages }
}

/** Emails the client a proposal, in the language the builder is using the app in. */
async function sendProposalEmail(
  builder: UserRow,
  project: ProjectRow,
  to: string,
  link: string,
  isNew: boolean,
  language: Language,
) {
  const say = messagesIn(language).proposalEmail
  const from = project.business_name === builder.name ? builder.name : `${builder.name} (${project.business_name})`
  await sendEmail({
    to,
    subject: say.subject(project.business_name),
    text: [
      say.greeting(project.client_name),
      '',
      say.sent(from),
      '',
      `  ${project.title}`,
      `  ${say.price(project.contract_amount, project.currency)}`,
      '',
      isNew ? say.signUp : say.open,
      link,
    ].join('\n'),
  })
}

/** A new invite link for a project. Only its hash is stored, so an older link stops working. */
async function newInviteLink(projectId: number) {
  const token = newSessionToken()
  await db.execute('UPDATE projects SET invite_token_hash = ? WHERE id = ?', [hashToken(token), projectId])
  return `${appUrl()}/invite?token=${encodeURIComponent(token)}`
}

// Sends a client a proposal: the work, its price and (optionally) its stages. It goes straight into
// the account of a client who has confirmed that email address. Anyone else gets an email with an
// invite link, to sign up (or log in) and see it.
projectRoutes.post('/projects', requireRole('builder'), async (req, res) => {
  const builder = me(res)
  const [profile] = await db.execute<RowDataPacket[]>('SELECT 1 FROM builder_profiles WHERE user_id = ?', [builder.id])
  if (!profile.length) return fail(res, 409, (m) => m.projects.needProfile)
  // Proposals send email in Casa Fida's name, so only from builders who have confirmed their own.
  if (!builder.email_verified_at) return fail(res, 409, (m) => m.projects.confirmEmailFirst)
  const key = String(builder.id)
  const wait = Math.max(limits.invitesPerBuilder.retryAfter(key), limits.invitesPerBuilderPerDay.retryAfter(key))
  if (wait) return tooManyAttempts(res, wait)

  const body = req.body ?? {}
  const details = readDetails(body)
  if ('error' in details) return badRequest(res, details.error)
  const amount = amountFrom(body.contractAmount)
  if (amount === null) return badRequest(res, (m) => m.projects.enterPrice)
  const currency = body.currency ?? DEFAULT_CURRENCY
  if (!isCurrency(currency)) return badRequest(res, (m) => m.general.chooseCurrency)
  const clientName = text(body.clientName)
  const clientEmail = text(body.clientEmail).toLowerCase()
  if (!clientName || clientName.length > NAME_MAX) return badRequest(res, (m) => m.projects.enterClientName)
  if (!isEmail(clientEmail)) return badRequest(res, (m) => m.projects.enterClientEmail)
  if (clientEmail === builder.email) return badRequest(res, (m) => m.projects.notYourEmail)
  const stageNames = readStageNames(body.stages)
  if ('error' in stageNames) return badRequest(res, stageNames.error)

  const [existing] = await db.execute<UserRow[]>('SELECT * FROM users WHERE email = ?', [clientEmail])
  const client = existing[0]
  if (client?.role === 'builder') {
    return badRequest(res, (m) => m.projects.builderEmail)
  }
  // Only someone who has shown the address is theirs gets the proposal without the emailed link.
  const owner = client?.email_verified_at ? client : undefined

  const projectId = await inTransaction(async (conn) => {
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO projects (builder_id, client_id, client_name, client_email, title, description, address,
                             currency, contract_amount, start_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed')`,
      [
        builder.id,
        owner?.id ?? null,
        clientName,
        clientEmail,
        details.title,
        details.description,
        details.address,
        currency,
        amount,
        details.startDate,
      ],
    )
    for (const [position, name] of stageNames.stages.entries()) {
      await conn.execute('INSERT INTO stages (project_id, name, position) VALUES (?, ?, ?)', [
        result.insertId,
        name,
        position,
      ])
    }
    return result.insertId
  })
  limits.invitesPerBuilder.hit(key)
  limits.invitesPerBuilderPerDay.hit(key)

  const project = (await loadProject(projectId))!
  const link = owner ? `${appUrl()}/projects/${projectId}` : await newInviteLink(projectId)
  await sendProposalEmail(builder, project, clientEmail, link, !client, languageOf(req)).catch((err) =>
    console.error('Proposal email failed:', err),
  )
  publish(owner?.id, { type: 'project', projectId })
  res.status(201).json({ project: await projectDetail((await loadProject(projectId))!, 'builder') })
})

// Changes a project's details. The price and its currency can only change while it's a proposal;
// after that, changes to the price go through change orders.
projectRoutes.put('/projects/:id', requireRole('builder'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'builder', ['proposed', 'active'])
  const details = readDetails(req.body ?? {})
  if ('error' in details) return badRequest(res, details.error)
  let amount = project.contract_amount
  if (req.body?.contractAmount !== undefined && req.body.contractAmount !== project.contract_amount) {
    if (project.status !== 'proposed') {
      return fail(res, 409, (m) => m.projects.priceAgreed)
    }
    const parsed = amountFrom(req.body.contractAmount)
    if (parsed === null) return badRequest(res, (m) => m.projects.enterPrice)
    amount = parsed
  }
  let currency = project.currency
  if (req.body?.currency !== undefined && req.body.currency !== project.currency) {
    if (project.status !== 'proposed') return fail(res, 409, (m) => m.projects.currencyLocked)
    if (!isCurrency(req.body.currency)) return badRequest(res, (m) => m.general.chooseCurrency)
    currency = req.body.currency
  }
  await db.execute(
    `UPDATE projects SET title = ?, description = ?, address = ?, start_date = ?, currency = ?, contract_amount = ?
     WHERE id = ?`,
    [details.title, details.description, details.address, details.startDate, currency, amount, project.id],
  )
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.json({ project: await projectDetail((await loadProject(project.id))!, 'builder') })
})

// Withdraws a proposal the client hasn't accepted, or clears away a declined one.
projectRoutes.delete('/projects/:id', requireRole('builder'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'builder', ['proposed', 'declined'])
  await db.execute('DELETE FROM projects WHERE id = ?', [project.id])
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.status(204).end()
})

// A fresh invite link for a client who doesn't have an account yet, to send them another way.
// The link in the first email stops working.
projectRoutes.post('/projects/:id/invite-link', requireRole('builder'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'builder', ['proposed'])
  if (project.client_id) {
    const name = project.client_user_name ?? project.client_name
    return fail(res, 409, (m) => m.projects.alreadyClaimed(name))
  }
  res.json({ link: await newInviteLink(project.id) })
})

// The client accepts a proposal: the project starts.
projectRoutes.post('/projects/:id/accept', requireRole('client'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'client', ['proposed'])
  await inTransaction(async (conn) => {
    const [result] = await conn.execute<ResultSetHeader>(
      "UPDATE projects SET status = 'active', accepted_at = NOW() WHERE id = ? AND status = 'proposed'",
      [project.id],
    )
    if (result.affectedRows === 0) throw conflict((m) => m.projects.changed)
    await ensureConversation(project.client_id!, project.builder_id, conn)
  })
  publish(project.builder_id, { type: 'project', projectId: project.id })
  notify(project.builder_id, 'projects', (m) => m.proposalAnswered(project.title, true), `/projects/${project.id}`)
  res.json({ project: await projectDetail((await loadProject(project.id))!, 'client') })
})

projectRoutes.post('/projects/:id/decline', requireRole('client'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'client', ['proposed'])
  await db.execute("UPDATE projects SET status = 'declined' WHERE id = ?", [project.id])
  publish(project.builder_id, { type: 'project', projectId: project.id })
  notify(project.builder_id, 'projects', (m) => m.proposalAnswered(project.title, false), `/projects/${project.id}`)
  res.json({ project: await projectDetail((await loadProject(project.id))!, 'client') })
})

// The builder marks the work as finished. The client can then leave a review.
projectRoutes.post('/projects/:id/complete', requireRole('builder'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'builder', ['active'])
  await db.execute("UPDATE projects SET status = 'completed', completed_at = NOW() WHERE id = ?", [project.id])
  await db.execute("UPDATE stages SET status = 'done' WHERE project_id = ?", [project.id])
  publish(project.client_id, { type: 'project', projectId: project.id })
  notify(
    project.client_id,
    'projects',
    (m) => m.projectCompleted(project.business_name, project.title),
    `/projects/${project.id}`,
  )
  res.json({ project: await projectDetail((await loadProject(project.id))!, 'builder') })
})

// The client reviews the builder, once, after the project is completed.
projectRoutes.post('/projects/:id/review', requireRole('client'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'client', ['completed'])
  const rating = wholeFrom(req.body?.rating, 1, 5)
  const body = longText(req.body?.body)
  if (rating === null) return badRequest(res, (m) => m.projects.chooseRating)
  if (body.length > REVIEW_MAX) return badRequest(res, (m) => m.projects.reviewTooLong)
  try {
    await db.execute('INSERT INTO reviews (project_id, builder_id, client_id, rating, body) VALUES (?, ?, ?, ?, ?)', [
      project.id,
      project.builder_id,
      project.client_id,
      rating,
      body,
    ])
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') return fail(res, 409, (m) => m.projects.alreadyReviewed)
    throw err
  }
  publish(project.builder_id, { type: 'project', projectId: project.id })
  res.status(201).json({ project: await projectDetail((await loadProject(project.id))!, 'client') })
})

// ---------- Invite links ----------

const INVITE_GONE: Text = (m) => m.projects.inviteGone

/**
 * The proposal an invite link is for, while it's waiting for an answer. It may be in someone's
 * account already: a client who confirmed this address after it was sent gets it straight away.
 */
async function projectForToken(token: unknown) {
  const value = text(token)
  if (!value || value.length > 100) return null
  const [rows] = await db.execute<ProjectRow[]>(
    `${projectSelect()} WHERE p.invite_token_hash = ? AND p.status = 'proposed'`,
    [hashToken(value)],
  )
  return rows[0] ?? null
}

// What an invite link is for, so the page can greet the person before they log in or sign up.
projectRoutes.post('/invites/preview', async (req, res) => {
  const project = await projectForToken(req.body?.token)
  if (!project) return fail(res, 404, INVITE_GONE)
  res.json({
    invite: {
      businessName: project.business_name,
      builderName: project.builder_name,
      title: project.title,
      clientName: project.client_name,
      clientEmail: project.client_email,
    },
  })
})

// Adds the proposal from an invite link to the logged-in client's account. The link was emailed to
// the address the builder typed, so if that's this account's address, it's now confirmed too.
projectRoutes.post('/invites/claim', requireUser, async (req, res) => {
  const user = me(res)
  const project = await projectForToken(req.body?.token)
  if (!project || (project.client_id !== null && project.client_id !== user.id)) throw notFound(INVITE_GONE)
  if (user.role !== 'client') {
    return fail(res, 403, (m) => m.projects.inviteForClients)
  }
  const [result] = await db.execute<ResultSetHeader>(
    'UPDATE projects SET client_id = ?, invite_token_hash = NULL WHERE id = ? AND (client_id IS NULL OR client_id = ?)',
    [user.id, project.id, user.id],
  )
  if (result.affectedRows === 0) throw notFound(INVITE_GONE)
  if (user.email === project.client_email) await confirmEmail(user)
  if (project.client_id === null) publish(project.builder_id, { type: 'project', projectId: project.id })
  res.json({ projectId: project.id })
})
