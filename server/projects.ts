// Loading projects and checking who may see and change them. Used by the project, work and
// billing routes.
import type { Response } from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import { db, ms } from './db.ts'
import { conflict, forbidden, notFound } from './errors.ts'
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
  contract_amount: number
  start_date: string | null
  status: ProjectStatus
  job_id: number | null
  invite_token_hash: string | null
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
}

/** SELECT … FROM projects with the builder's and client's details. `extra` adds more columns. */
export const projectSelect = (extra = '') => `
  SELECT p.*, ${ms('p.created_at')} AS created_at, ${ms('p.accepted_at')} AS accepted_at,
         ${ms('p.completed_at')} AS completed_at,
         bu.name AS builder_name, bu.email AS builder_email, bu.phone AS builder_phone,
         COALESCE(b.business_name, bu.name) AS business_name,
         cu.name AS client_user_name, cu.email AS client_user_email, cu.phone AS client_phone ${extra}
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

export const PROJECT_GONE = "This project doesn't exist."

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

const STATUS_WORDS: Record<ProjectStatus, string> = {
  proposed: 'still a proposal',
  active: 'in progress',
  completed: 'completed',
  declined: 'declined',
}

/**
 * The project with this id, if the logged-in person is on the given side of it and it's in one of
 * the given states. Otherwise throws a 404, 403 or 409 with a readable message.
 */
export async function projectAs(res: Response, id: unknown, side: Side, statuses: ProjectStatus[]) {
  const found = await projectFor(res, id)
  if (found.side !== side) {
    throw forbidden(side === 'builder' ? 'Only the builder can do that.' : 'Only the client can do that.')
  }
  if (!statuses.includes(found.project.status)) {
    throw conflict(`You can't do that while the project is ${STATUS_WORDS[found.project.status]}.`)
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
