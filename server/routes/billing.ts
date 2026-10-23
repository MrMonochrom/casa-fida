// Money on a project: change orders (the client approves changes to the price or schedule) and
// invoices (the builder bills, and marks them paid when the money arrives).
import express from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { formatMoney } from '../../shared/money.ts'
import { CHANGE_DAYS_MAX, DESCRIPTION_MAX, TITLE_MAX } from '../../shared/rules.ts'
import { db, inTransaction } from '../db.ts'
import { conflict, notFound } from '../errors.ts'
import { publish } from '../events.ts'
import { loadProject, moneyOf, otherSide, projectAs, projectFor } from '../projects.ts'
import type { ProjectStatus, Side } from '../projects.ts'
import { requireRole } from '../session.ts'
import { amountFrom, badRequest, dateFrom, idFrom, longText, text, wholeFrom } from '../validate.ts'
import { projectDetail } from './projects.ts'

export const billingRoutes = express.Router()

const view = async (projectId: number, side: Side) => projectDetail((await loadProject(projectId))!, side)

/** The row with this id from `table`, and its project, if the logged-in person is on the given side. */
async function itemAs(
  res: express.Response,
  table: 'change_orders' | 'invoices',
  id: unknown,
  side: Side,
  statuses: ProjectStatus[],
) {
  const itemId = idFrom(id)
  const [rows] = itemId ? await db.execute<RowDataPacket[]>(`SELECT * FROM ${table} WHERE id = ?`, [itemId]) : [[]]
  const item = (rows as RowDataPacket[])[0]
  const missing = table === 'invoices' ? "This invoice doesn't exist." : "This change order doesn't exist."
  if (!item) throw notFound(missing)
  // Someone who isn't on the project gets the same answer as for an id that doesn't exist.
  await projectFor(res, item.project_id).catch(() => {
    throw notFound(missing)
  })
  return { item, project: await projectAs(res, item.project_id, side, statuses) }
}

// ---------- Change orders ----------

billingRoutes.post('/projects/:id/change-orders', requireRole('builder'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'builder', ['active'])
  const title = text(req.body?.title)
  const description = longText(req.body?.description)
  const amount = amountFrom(req.body?.amount, { allowZero: true, allowNegative: true })
  const days = req.body?.days == null || req.body.days === '' ? 0 : wholeFrom(req.body.days, -CHANGE_DAYS_MAX, CHANGE_DAYS_MAX)
  if (!title || title.length > TITLE_MAX) return badRequest(res, 'Give the change a short title.')
  if (!description) return badRequest(res, 'Describe what changes.')
  if (description.length > DESCRIPTION_MAX) {
    return badRequest(res, `Keep the description under ${DESCRIPTION_MAX.toLocaleString('en')} characters.`)
  }
  if (amount === null) return badRequest(res, 'Enter how much the price changes: 0 if it stays the same.')
  if (days === null) return badRequest(res, `The schedule change should be a whole number of days, up to ${CHANGE_DAYS_MAX}.`)
  const money = await moneyOf(project)
  if (money.total + amount < 0) return badRequest(res, "A change can't take the price below zero.")

  await db.execute('INSERT INTO change_orders (project_id, title, description, amount, days) VALUES (?, ?, ?, ?, ?)', [
    project.id,
    title,
    description,
    amount,
    days,
  ])
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.status(201).json({ project: await view(project.id, 'builder') })
})

/** Moves a pending change order to `status`, as long as it's still pending. */
async function decide(id: number, status: 'approved' | 'declined' | 'withdrawn') {
  const [result] = await db.execute<ResultSetHeader>(
    "UPDATE change_orders SET status = ?, decided_at = NOW() WHERE id = ? AND status = 'pending'",
    [status, id],
  )
  if (result.affectedRows === 0) throw conflict('This change order has already been answered.')
}

for (const [action, status] of [
  ['approve', 'approved'],
  ['decline', 'declined'],
] as const) {
  billingRoutes.post(`/change-orders/:id/${action}`, requireRole('client'), async (req, res) => {
    const { item, project } = await itemAs(res, 'change_orders', req.params.id, 'client', ['active'])
    await decide(item.id, status)
    publish(otherSide(project, 'client'), { type: 'project', projectId: project.id })
    res.json({ project: await view(project.id, 'client') })
  })
}

billingRoutes.post('/change-orders/:id/withdraw', requireRole('builder'), async (req, res) => {
  const { item, project } = await itemAs(res, 'change_orders', req.params.id, 'builder', ['active'])
  await decide(item.id, 'withdrawn')
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.json({ project: await view(project.id, 'builder') })
})

// ---------- Invoices ----------

// Bills the client. Invoices can't add up to more than the price with its approved changes.
billingRoutes.post('/projects/:id/invoices', requireRole('builder'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'builder', ['active', 'completed'])
  const title = text(req.body?.title)
  const amount = amountFrom(req.body?.amount)
  const dueDate = dateFrom(req.body?.dueDate)
  if (!title || title.length > TITLE_MAX) return badRequest(res, 'Say what the invoice is for, like "Deposit".')
  if (amount === null) return badRequest(res, 'Enter the amount to bill.')
  if (!dueDate) return badRequest(res, 'Choose when the invoice is due.')

  await inTransaction(async (conn) => {
    // Locks the project, so two invoices sent at once can't both use what's left.
    await conn.execute('SELECT id FROM projects WHERE id = ? FOR UPDATE', [project.id])
    const money = await moneyOf(project)
    if (amount > money.leftToInvoice) {
      throw conflict(
        money.leftToInvoice > 0
          ? `That's more than is left to invoice (${formatMoney(money.leftToInvoice)}).`
          : 'Everything on this project has been invoiced already. Send a change order for extra work.',
      )
    }
    await conn.execute(
      `INSERT INTO invoices (project_id, number, title, amount, due_date)
       SELECT ?, COALESCE(MAX(number), 0) + 1, ?, ?, ? FROM invoices WHERE project_id = ?`,
      [project.id, title, amount, dueDate, project.id],
    )
  })
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.status(201).json({ project: await view(project.id, 'builder') })
})

for (const [action, status] of [
  ['paid', 'paid'],
  ['void', 'void'],
] as const) {
  billingRoutes.post(`/invoices/:id/${action}`, requireRole('builder'), async (req, res) => {
    const { item, project } = await itemAs(res, 'invoices', req.params.id, 'builder', ['active', 'completed'])
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE invoices SET status = ?, paid_at = ${status === 'paid' ? 'NOW()' : 'NULL'} WHERE id = ? AND status = 'due'`,
      [status, item.id],
    )
    if (result.affectedRows === 0) throw conflict('This invoice is already paid or void.')
    publish(project.client_id, { type: 'project', projectId: project.id })
    res.json({ project: await view(project.id, 'builder') })
  })
}
