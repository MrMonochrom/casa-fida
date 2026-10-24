// Loading projects and checking who may see and change them. Used by the project, work and
// billing routes.
import type { Response } from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import type { Currency } from '../shared/money.ts'
import { db, ms } from './db.ts'
import { conflict, forbidden, notFound } from './errors.ts'
import type { Text } from './i18n/index.ts'
import { me } from './session.ts'

export type ProjectStatus = 'proposed' | 'active' | 'completed' | 'declined'

export interface ProjectRow extends RowDataPacket {
  id: number
  builder_id: number
  client_id: number | null
  client_name: string
  client_email: string
  title: string
  description: string
  address: string
  currency: Currency
  contract_amount: number
  start_date: string | null
  status: ProjectStatus
  job_id: number | null
  invite_token_hash: string | null
  invite_emailed: number
  created_at: number
  accepted_at: number | null
  completed_at: number | null
  builder_name: string
  builder_email: string
  builder_phone: string | null
  business_name: string
  client_user_name: string | null
  client_user_email: string | null
  client_phone: string | null
  pending_changes: number
  due_invoices: number
  waiting_on_client: number
}

/**
 * What's waiting on a project's client, as SQL for the project `p`: change orders to approve (only
 * while the work is in progress, the only time they can be answered), invoices to pay, and, in
 * WAITING_ON_CLIENT, a proposal to answer too. The project list, the project page and the menu
 * badge all count with these, so they always agree.
 */
const PENDING_CHANGES = `(SELECT COUNT(*) FROM change_orders c WHERE c.project_id = p.id AND c.status = 'pending' AND p.status = 'active')`
const DUE_INVOICES = `(SELECT COUNT(*) FROM invoices i WHERE i.project_id = p.id AND i.status = 'due')`
export const WAITING_ON_CLIENT = `((p.status = 'proposed') + ${PENDING_CHANGES} + ${DUE_INVOICES})`

/** SELECT … FROM projects with the builder's and client's details. `extra` adds more columns. */
export const projectSelect = (extra = '') => `
  SELECT p.*, ${ms('p.created_at')} AS created_at, ${ms('p.accepted_at')} AS accepted_at,
         ${ms('p.completed_at')} AS completed_at,
         bu.name AS builder_name, bu.email AS builder_email, bu.phone AS builder_phone,
         COALESCE(b.business_name, bu.name) AS business_name,
         cu.name AS client_user_name, cu.email AS client_user_email, cu.phone AS client_phone,
         ${PENDING_CHANGES} AS pending_changes, ${DUE_INVOICES} AS due_invoices,
         ${WAITING_ON_CLIENT} AS waiting_on_client ${extra}
  FROM projects p
  JOIN users bu ON bu.id = p.builder_id
  LEFT JOIN builder_profiles b ON b.user_id = p.builder_id
  LEFT JOIN users cu ON cu.id = p.client_id`

export async function loadProject(id: number | null): Promise<ProjectRow | null> {
  if (!id) return null
  const [rows] = await db.execute<ProjectRow[]>(`${projectSelect()} WHERE p.id = ?`, [id])
  return rows[0] ?? null
}

export type Side = 'builder' | 'client'

export const PROJECT_GONE: Text = (m) => m.projects.gone

/** The project with this id, and which side of it the logged-in person is on. 404 if they're not part of it. */
export async function projectFor(res: Response, id: unknown) {
  const project = await loadProject(typeof id === 'number' ? id : Number(id) || null)
  const userId = me(res).id
  const side: Side | null = !project
    ? null
    : project.builder_id === userId
      ? 'builder'
      : project.client_id === userId
        ? 'client'
        : null
  if (!project || !side) throw notFound(PROJECT_GONE)
  return { project, side }
}

/** The other person on a project, to send them live updates. */
export const otherSide = (project: ProjectRow, side: Side) => (side === 'builder' ? project.client_id : project.builder_id)

/**
 * The project with this id, if the logged-in person is on the given side of it and it's in one of
 * the given states. Otherwise throws a 404, 403 or 409 with a readable message.
 */
export async function projectAs(res: Response, id: unknown, side: Side, statuses: ProjectStatus[]) {
  const found = await projectFor(res, id)
  if (found.side !== side) {
    throw forbidden(side === 'builder' ? (m) => m.projects.builderOnly : (m) => m.projects.clientOnly)
  }
  if (!statuses.includes(found.project.status)) {
    const status = found.project.status
    throw conflict((m) => m.projects.notWhile[status])
  }
  return found.project
}

/** The money side of a project: the price with approved changes, what's been invoiced and paid. */
export async function moneyOf(project: Pick<ProjectRow, 'id' | 'contract_amount'>) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT
       (SELECT COALESCE(SUM(amount), 0) FROM change_orders WHERE project_id = ? AND status = 'approved') AS changes,
       (SELECT COALESCE(SUM(days), 0) FROM change_orders WHERE project_id = ? AND status = 'approved') AS days_added,
       (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE project_id = ? AND status <> 'void') AS invoiced,
       (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE project_id = ? AND status = 'paid') AS paid`,
    [project.id, project.id, project.id, project.id],
  )
  const changes = Number(rows[0].changes)
  const invoiced = Number(rows[0].invoiced)
  const paid = Number(rows[0].paid)
  const total = project.contract_amount + changes
  return {
    contract: project.contract_amount,
    changes,
    total,
    invoiced,
    paid,
    outstanding: invoiced - paid,
    leftToInvoice: total - invoiced,
    daysAdded: Number(rows[0].days_added),
  }
}
