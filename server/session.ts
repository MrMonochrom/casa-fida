import type { NextFunction, Request, Response } from 'express'
import type { Role } from '../shared/rules.ts'
import { db } from './db.ts'
import { hashToken, newSessionToken } from './auth.ts'
import type { UserRow } from './users.ts'

const SESSION_COOKIE = 'bb_session'
const SESSION_DAYS = 30

/** The session token from the request's cookie, if any. */
export function sessionToken(req: Request): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=')
    if (key !== SESSION_COOKIE) continue
    try {
      return decodeURIComponent(rest.join('='))
    } catch {
      // A damaged cookie counts as no session, so the person is simply asked to log in again.
      return undefined
    }
  }
  return undefined
}

export async function startSession(res: Response, userId: number) {
  const token = newSessionToken()
  await db.execute('DELETE FROM sessions WHERE user_id = ? AND expires_at <= NOW()', [userId])
  await db.execute(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL ? DAY)',
    [hashToken(token), userId, SESSION_DAYS],
  )
  await db.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [userId])
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

export async function endSession(req: Request, res: Response) {
  const token = sessionToken(req)
  if (token) await db.execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)])
  res.clearCookie(SESSION_COOKIE, { path: '/' })
}

export async function currentUser(req: Request): Promise<UserRow | null> {
  const token = sessionToken(req)
  if (!token) return null
  const [rows] = await db.execute<UserRow[]>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > NOW()`,
    [hashToken(token)],
  )
  return rows[0] ?? null
}

/** Route guard: answers 401 unless someone is logged in. Use me(res) in the route to get them. */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = await currentUser(req)
  if (!user) {
    res.status(401).json({ error: 'Please log in again.' })
    return
  }
  res.locals.user = user
  next()
}

const ROLE_ONLY: Record<Role, string> = {
  client: 'Only clients can do that.',
  builder: 'Only builders can do that.',
}

/** Route guard: like requireUser, and answers 403 unless the person has this role. */
export function requireRole(role: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requireUser(req, res, () => {
      if (me(res).role !== role) {
        res.status(403).json({ error: ROLE_ONLY[role] })
        return
      }
      next()
    })
  }
}

/** The logged-in user, in a route that uses requireUser or requireRole. */
export function me(res: Response): UserRow {
  return res.locals.user as UserRow
}
