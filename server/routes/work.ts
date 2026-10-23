// The work on a project: its stages, and the builder's progress updates with photos.
import express from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { PHOTOS_PER_UPDATE, PHOTO_MAX_BYTES, STAGES_MAX, STAGE_NAME_MAX, UPDATE_MAX } from '../../shared/rules.ts'
import { db, inTransaction, ms } from '../db.ts'
import { forbidden, notFound } from '../errors.ts'
import { publish } from '../events.ts'
import { loadProject, projectAs, projectFor } from '../projects.ts'
import { me, requireRole, requireUser } from '../session.ts'
import { badRequest, fail, idFrom, invalid, longText, text } from '../validate.ts'
import { projectDetail, stagesOf } from './projects.ts'

export const workRoutes = express.Router()

/** The whole project as its builder sees it, sent back after each change. */
const builderView = async (projectId: number) => projectDetail((await loadProject(projectId))!, 'builder')

const STAGE_STATUSES = ['todo', 'in_progress', 'done'] as const
type StageStatus = (typeof STAGE_STATUSES)[number]

/** The project a stage belongs to, if the logged-in builder may change it. */
async function projectOfStage(res: express.Response, stageId: unknown) {
  const id = idFrom(stageId)
  const [rows] = id ? await db.execute<RowDataPacket[]>('SELECT project_id FROM stages WHERE id = ?', [id]) : [[]]
  const stage = (rows as RowDataPacket[])[0]
  if (!stage) throw notFound((m) => m.stages.gone)
  return { stageId: id!, project: await projectAs(res, stage.project_id, 'builder', ['proposed', 'active']) }
}

function readStageName(value: unknown) {
  const name = text(value)
  if (!name) return invalid((m) => m.stages.enterName)
  if (name.length > STAGE_NAME_MAX) return invalid((m) => m.stages.nameTooLong)
  return { name }
}

// Adds a stage at the end.
workRoutes.post('/projects/:id/stages', requireRole('builder'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'builder', ['proposed', 'active'])
  const input = readStageName(req.body?.name)
  if ('error' in input) return badRequest(res, input.error)
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO stages (project_id, name, position)
     SELECT ?, ?, COALESCE(MAX(position) + 1, 0) FROM stages WHERE project_id = ? HAVING COUNT(*) < ?`,
    [project.id, input.name, project.id, STAGES_MAX],
  )
  if (result.affectedRows === 0) return fail(res, 409, (m) => m.stages.tooMany)
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.status(201).json({ project: await builderView(project.id) })
})

// Renames a stage or moves it along: to do, in progress, done.
workRoutes.put('/stages/:id', requireRole('builder'), async (req, res) => {
  const { stageId, project } = await projectOfStage(res, req.params.id)
  const changes: string[] = []
  const params: (string | number)[] = []
  if (req.body?.name !== undefined) {
    const input = readStageName(req.body.name)
    if ('error' in input) return badRequest(res, input.error)
    changes.push('name = ?')
    params.push(input.name)
  }
  if (req.body?.status !== undefined) {
    if (!STAGE_STATUSES.includes(req.body.status)) return badRequest(res, (m) => m.stages.badStatus)
    changes.push('status = ?')
    params.push(req.body.status as StageStatus)
  }
  if (changes.length === 0) return badRequest(res, (m) => m.stages.nothingToChange)
  await db.execute(`UPDATE stages SET ${changes.join(', ')} WHERE id = ?`, [...params, stageId])
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.json({ project: await builderView(project.id) })
})

workRoutes.delete('/stages/:id', requireRole('builder'), async (req, res) => {
  const { stageId, project } = await projectOfStage(res, req.params.id)
  await db.execute('DELETE FROM stages WHERE id = ?', [stageId])
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.json({ project: await builderView(project.id) })
})

// Puts the stages in a new order. `ids` must list every stage of the project once.
workRoutes.put('/projects/:id/stages/order', requireRole('builder'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'builder', ['proposed', 'active'])
  const ids: (number | null)[] = Array.isArray(req.body?.ids) ? req.body.ids.map(idFrom) : []
  const current = (await stagesOf(project.id)).map((s) => s.id)
  const valid =
    ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id!))
  if (!valid) return badRequest(res, (m) => m.stages.badOrder)
  await inTransaction(async (conn) => {
    for (const [position, id] of ids.entries()) {
      await conn.execute('UPDATE stages SET position = ? WHERE id = ? AND project_id = ?', [position, id, project.id])
    }
  })
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.json({ project: await builderView(project.id) })
})

// ---------- Updates and photos ----------

export const photoUrl = (id: number) => `/api/photos/${id}`

interface UpdateRow extends RowDataPacket {
  id: number
  author_id: number
  author_name: string
  stage_id: number | null
  stage_name: string | null
  body: string
  created_at: number
  photo_ids: string | null
}

const UPDATE_SELECT = `
  SELECT up.id, up.author_id, u.name AS author_name, up.stage_id, s.name AS stage_name, up.body,
         ${ms('up.created_at')} AS created_at,
         (SELECT GROUP_CONCAT(ph.id ORDER BY ph.position, ph.id) FROM update_photos ph WHERE ph.update_id = up.id) AS photo_ids
  FROM updates up
  JOIN users u ON u.id = up.author_id
  LEFT JOIN stages s ON s.id = up.stage_id`

function toUpdate(row: UpdateRow) {
  return {
    id: row.id,
    author: { id: row.author_id, name: row.author_name },
    stage: row.stage_id === null ? null : { id: row.stage_id, name: row.stage_name! },
    body: row.body,
    photos: row.photo_ids ? row.photo_ids.split(',').map((id) => ({ id: Number(id), url: photoUrl(Number(id)) })) : [],
    createdAt: Number(row.created_at),
  }
}

async function loadUpdate(id: number) {
  const [rows] = await db.execute<UpdateRow[]>(`${UPDATE_SELECT} WHERE up.id = ?`, [id])
  return rows[0] ? toUpdate(rows[0]) : null
}

// A project's updates, newest first.
workRoutes.get('/projects/:id/updates', requireUser, async (req, res) => {
  const { project } = await projectFor(res, req.params.id)
  const [rows] = await db.execute<UpdateRow[]>(
    `${UPDATE_SELECT} WHERE up.project_id = ? ORDER BY up.created_at DESC, up.id DESC LIMIT 500`,
    [project.id],
  )
  res.json({ updates: rows.map(toUpdate) })
})

// Posts an update. Photos are added to it afterwards, one request each.
workRoutes.post('/projects/:id/updates', requireRole('builder'), async (req, res) => {
  const project = await projectAs(res, req.params.id, 'builder', ['active'])
  const body = longText(req.body?.body)
  if (!body) return badRequest(res, (m) => m.updates.enterBody)
  if (body.length > UPDATE_MAX) return badRequest(res, (m) => m.updates.tooLong)
  let stageId: number | null = null
  if (req.body?.stageId != null) {
    stageId = idFrom(req.body.stageId)
    const stages = await stagesOf(project.id)
    if (!stageId || !stages.some((s) => s.id === stageId)) return badRequest(res, (m) => m.stages.notInProject)
  }
  const [result] = await db.execute<ResultSetHeader>(
    'INSERT INTO updates (project_id, author_id, stage_id, body) VALUES (?, ?, ?, ?)',
    [project.id, me(res).id, stageId, body],
  )
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.status(201).json({ update: await loadUpdate(result.insertId) })
})

/** The update with this id, if the logged-in person wrote it. */
async function ownUpdate(res: express.Response, id: unknown) {
  const updateId = idFrom(id)
  const [rows] = updateId
    ? await db.execute<RowDataPacket[]>('SELECT id, project_id, author_id FROM updates WHERE id = ?', [updateId])
    : [[]]
  const update = (rows as RowDataPacket[])[0]
  if (!update) throw notFound((m) => m.updates.gone)
  const { project } = await projectFor(res, update.project_id)
  if (update.author_id !== me(res).id) throw forbidden((m) => m.updates.authorOnly)
  return { updateId: update.id as number, project }
}

const isJpeg = (data: unknown): data is Buffer =>
  Buffer.isBuffer(data) && data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff

// Adds a photo to your update. The browser shrinks photos to a JPEG first, so only JPEG is accepted.
workRoutes.post(
  '/updates/:id/photos',
  requireRole('builder'),
  express.raw({ type: 'image/jpeg', limit: PHOTO_MAX_BYTES }),
  async (req, res) => {
    const data: unknown = req.body
    if (!isJpeg(data)) return badRequest(res, (m) => m.updates.jpegOnly)
    const { updateId, project } = await ownUpdate(res, req.params.id)
    if (project.status !== 'active') return fail(res, 409, (m) => m.updates.photosWhileActive)
    // Only inserts while the update has fewer than PHOTOS_PER_UPDATE, checked in the same statement.
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO update_photos (update_id, position, mime_type, data)
       SELECT ?, COALESCE(MAX(position) + 1, 0), 'image/jpeg', ? FROM update_photos WHERE update_id = ?
       HAVING COUNT(*) < ?`,
      [updateId, data, updateId, PHOTOS_PER_UPDATE],
    )
    if (result.affectedRows === 0) return fail(res, 409, (m) => m.updates.tooManyPhotos)
    publish(project.client_id, { type: 'project', projectId: project.id })
    res.status(201).json({ photo: { id: result.insertId, url: photoUrl(result.insertId) } })
  },
)

workRoutes.delete('/updates/:id', requireUser, async (req, res) => {
  const { updateId, project } = await ownUpdate(res, req.params.id)
  await db.execute('DELETE FROM updates WHERE id = ?', [updateId])
  publish(project.client_id, { type: 'project', projectId: project.id })
  res.status(204).end()
})

// A photo, for the two people on its project only.
workRoutes.get('/photos/:id', requireUser, async (req, res) => {
  const userId = me(res).id
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT ph.mime_type, ph.data FROM update_photos ph
     JOIN updates up ON up.id = ph.update_id
     JOIN projects p ON p.id = up.project_id
     WHERE ph.id = ? AND (p.builder_id = ? OR p.client_id = ?)`,
    [idFrom(req.params.id) ?? 0, userId, userId],
  )
  if (!rows[0]) return fail(res, 404, (m) => m.updates.noPhoto)
  res.set({
    'Content-Type': rows[0].mime_type,
    // Photos never change, so this one can be cached for good.
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  })
  res.send(rows[0].data)
})
