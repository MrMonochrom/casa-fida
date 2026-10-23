import express from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { formatMoney } from '../../shared/money.ts'
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
import { publish } from '../events.ts'
import { appUrl, sendEmail } from '../mailer.ts'
import { loadProject, moneyOf, projectAs, projectFor, projectSelect } from '../projects.ts'
import type { ProjectRow, Side } from '../projects.ts'
import { limits, tooManyAttempts } from '../rateLimit.ts'
import { me, requireRole, requireUser } from '../session.ts'
import type { UserRow } from '../users.ts'
import { amountFrom, badRequest, dateFrom, fail, isEmail, longText, text, wholeFrom } from '../validate.ts'

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
    client: linked
      ? { id: project.client_id!, name: project.client_user_name!, email: project.client_user_email!, phone: project.client_phone }
      : null,
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
        startDate: r.start_date,
        createdAt: Number(r.created_at),
        builder: { id: r.builder_id, name: r.builder_name, businessName: r.business_name },
        client: r.client_id ? { id: r.client_id, name: r.client_user_name! } : null,
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
  if (!title || title.length > TITLE_MAX) return { error: 'Give the project a short title.' }
  if (!description) return { error: 'Describe the work this project covers.' }
  if (description.length > DESCRIPTION_MAX) {
    return { error: `Keep the description under ${DESCRIPTION_MAX.toLocaleString('en')} characters.` }
  }
  if (address.length > PLACE_MAX) return { error: 'That address is too long.' }
  let startDate: string | null = null
  if (body.startDate) {
    startDate = dateFrom(body.startDate)
    if (!startDate) return { error: 'Please enter a valid start date.' }
  }
  return { title, description, address, startDate }
}

function readStageNames(value: unknown) {
  if (value == null) return { stages: [] as string[] }
  if (!Array.isArray(value)) return { error: 'Stages should be a list of names.' }
  const stages = [...new Set(value.map(text).filter(Boolean))]
  if (stages.length > STAGES_MAX) return { error: `A project can have up to ${STAGES_MAX} stages.` }
  if (stages.some((s) => s.length > STAGE_NAME_MAX)) return { error: `Keep stage names under ${STAGE_NAME_MAX} characters.` }
  return { stages }
}

async function sendProposalEmail(builder: UserRow, project: ProjectRow, to: string, link: string, isNew: boolean) {
  const from = project.business_name === builder.name ? builder.name : `${builder.name} (${project.business_name})`
  await sendEmail({
    to,
    subject: `${project.business_name} sent you a project proposal`,
    text: [
      `Hi ${project.client_name},`,
      '',
      `${from} has sent you a proposal on BuildBridge:`,
      '',
      `  ${project.title}`,
      `  Price: ${formatMoney(project.contract_amount)}`,
      '',
      isNew ? 'Create your free account to see the details and accept or decline it:' : 'See it and accept or decline it here:',
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

// Sends a client a proposal: the work, its price and (optionally) its stages. If the client has no
// account yet, they get an email with an invite link to sign up and see it.
projectRoutes.post('/projects', requireRole('builder'), async (req, res) => {
  const builder = me(res)
  const [profile] = await db.execute<RowDataPacket[]>('SELECT 1 FROM builder_profiles WHERE user_id = ?', [builder.id])
  if (!profile.length) return fail(res, 409, 'Set up your business profile before sending proposals.')
  const wait = limits.invitesPerBuilder.retryAfter(String(builder.id))
  if (wait) return tooManyAttempts(res, wait)

  const body = req.body ?? {}
  const details = readDetails(body)
  if ('error' in details) return badRequest(res, details.error!)
  const amount = amountFrom(body.contractAmount)
  if (amount === null) return badRequest(res, 'Enter the price for the work.')
  const clientName = text(body.clientName)
  const clientEmail = text(body.clientEmail).toLowerCase()
  if (!clientName || clientName.length > NAME_MAX) return badRequest(res, "Enter your client's name.")
  if (!isEmail(clientEmail)) return badRequest(res, "Enter your client's email address.")
  if (clientEmail === builder.email) return badRequest(res, "Use your client's email address, not yours.")
  const stageNames = readStageNames(body.stages)
  if ('error' in stageNames) return badRequest(res, stageNames.error!)

  const [existing] = await db.execute<UserRow[]>('SELECT * FROM users WHERE email = ?', [clientEmail])
  const client = existing[0]
  if (client?.role === 'builder') {
    return badRequest(res, 'That email belongs to a builder account. Proposals can only go to clients.')
  }

  const projectId = await inTransaction(async (conn) => {
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO projects (builder_id, client_id, client_name, client_email, title, description, address,
                             contract_amount, start_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed')`,
      [
        builder.id,
        client?.id ?? null,
        client?.name ?? clientName,
        clientEmail,
        details.title,
        details.description,
        details.address,
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
  limits.invitesPerBuilder.hit(String(builder.id))

  const project = (await loadProject(projectId))!
  const link = client ? `${appUrl()}/projects/${projectId}` : await newInviteLink(projectId)
  await sendProposalEmail(builder, project, clientEmail, link, !client).catch((err) =>
    console.error('Proposal email failed:', err),
  )
  publish(client?.id, { type: 'project', projectId })
  res.status(201).json({ project: await projectDetail((await loadProject(projectId))!, 'builder') })
})

// Changes a project's details. The price can only change while it's a proposal; after that,
// changes to the price go through change orders.
projectRoutes.put('/projects/:id', requireRole('builder'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'builder', ['proposed', 'active'])
  const details = readDetails(req.body ?? {})
  if ('error' in details) return badRequest(res, details.error!)
  let amount = project.contract_amount
  if (req.body?.contractAmount !== undefined && req.body.contractAmount !== project.contract_amount) {
    if (project.status !== 'proposed') {
      return fail(res, 409, 'The price is agreed. Send a change order to change it.')
    }
    const parsed = amountFrom(req.body.contractAmount)
    if (parsed === null) return badRequest(res, 'Enter the price for the work.')
    amount = parsed
  }
  await db.execute(
    'UPDATE projects SET title = ?, description = ?, address = ?, start_date = ?, contract_amount = ? WHERE id = ?',
    [details.title, details.description, details.address, details.startDate, amount, project.id],
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
  if (project.client_id) return fail(res, 409, `${project.client_user_name} already has this proposal in their account.`)
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
    if (result.affectedRows === 0) throw conflict('This proposal has changed. Please look again.')
    await ensureConversation(project.client_id!, project.builder_id, conn)
  })
  publish(project.builder_id, { type: 'project', projectId: project.id })
  res.json({ project: await projectDetail((await loadProject(project.id))!, 'client') })
})

projectRoutes.post('/projects/:id/decline', requireRole('client'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'client', ['proposed'])
  await db.execute("UPDATE projects SET status = 'declined' WHERE id = ?", [project.id])
  publish(project.builder_id, { type: 'project', projectId: project.id })
  res.json({ project: await projectDetail((await loadProject(project.id))!, 'client') })
})

// The builder marks the work as finished. The client can then leave a review.
projectRoutes.post('/projects/:id/complete', requireRole('builder'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'builder', ['active'])
  await db.execute("UPDATE projects SET status = 'completed', completed_at = NOW() WHERE id = ?", [project.id])
  await db.execute("UPDATE stages SET status = 'done' WHERE project_id = ?", [project.id])
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.json({ project: await projectDetail((await loadProject(project.id))!, 'builder') })
})

// The client reviews the builder, once, after the project is completed.
projectRoutes.post('/projects/:id/review', requireRole('client'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'client', ['completed'])
  const rating = wholeFrom(req.body?.rating, 1, 5)
  const body = longText(req.body?.body)
  if (rating === null) return badRequest(res, 'Choose a rating from 1 to 5 stars.')
  if (body.length > REVIEW_MAX) return badRequest(res, `Keep your review under ${REVIEW_MAX.toLocaleString('en')} characters.`)
  try {
    await db.execute('INSERT INTO reviews (project_id, builder_id, client_id, rating, body) VALUES (?, ?, ?, ?, ?)', [
      project.id,
      project.builder_id,
      project.client_id,
      rating,
      body,
    ])
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') return fail(res, 409, "You've already reviewed this project.")
    throw err
  }
  publish(project.builder_id, { type: 'project', projectId: project.id })
  res.status(201).json({ project: await projectDetail((await loadProject(project.id))!, 'client') })
})

// ---------- Invite links ----------

const INVITE_GONE = 'This invite link has expired or was already used. Ask your builder for a new one.'

async function projectForToken(token: unknown) {
  const value = text(token)
  if (!value || value.length > 100) return null
  const [rows] = await db.execute<ProjectRow[]>(
    `${projectSelect()} WHERE p.invite_token_hash = ? AND p.status = 'proposed' AND p.client_id IS NULL`,
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

// Adds the proposal from an invite link to the logged-in client's account.
projectRoutes.post('/invites/claim', requireUser, async (req, res) => {
  const user = me(res)
  const project = await projectForToken(req.body?.token)
  if (!project) throw notFound(INVITE_GONE)
  if (user.role !== 'client') {
    return fail(res, 403, 'Proposals are for client accounts. Log out and sign up as a client to accept it.')
  }
  const [result] = await db.execute<ResultSetHeader>(
    'UPDATE projects SET client_id = ?, invite_token_hash = NULL WHERE id = ? AND client_id IS NULL',
    [user.id, project.id],
  )
  if (result.affectedRows === 0) throw notFound(INVITE_GONE)
  publish(project.builder_id, { type: 'project', projectId: project.id })
  res.json({ projectId: project.id })
})
