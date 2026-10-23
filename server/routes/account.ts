import express from 'express'
import type { ResultSetHeader } from 'mysql2/promise'
import { NAME_MAX, ROLES } from '../../shared/rules.ts'
import type { Role } from '../../shared/rules.ts'
import { db } from '../db.ts'
import { hashPassword, hashToken, verifyPassword } from '../auth.ts'
import { limits, tooManyAttempts } from '../rateLimit.ts'
import { currentUser, endSession, me, requireUser, sessionToken, startSession } from '../session.ts'
import { loadUser, ownAccount } from '../users.ts'
import type { UserRow } from '../users.ts'
import { badRequest, isEmail, passwordProblem, text } from '../validate.ts'

export const accountRoutes = express.Router()

const PHONE_MAX = 40

function readSignup(body: Record<string, unknown>) {
  const name = text(body.name)
  const email = text(body.email).toLowerCase()
  const role = body.role as Role

  if (!ROLES.includes(role)) return { error: 'Choose whether you are a client or a builder.' }
  if (!name || name.length > NAME_MAX) return { error: 'Please enter your name.' }
  if (!isEmail(email)) return { error: 'Please enter a valid email address.' }
  const problem = passwordProblem(body.password)
  if (problem) return { error: problem }

  return { name, email, role, password: body.password as string }
}

// Creates an account and logs in. Builders set up their business profile next.
accountRoutes.post('/signup', async (req, res) => {
  const ip = req.ip ?? ''
  const wait = limits.signupsPerIp.retryAfter(ip)
  if (wait) return tooManyAttempts(res, wait)

  const input = readSignup(req.body ?? {})
  if ('error' in input) return badRequest(res, input.error!)

  let userId: number
  try {
    const [result] = await db.execute<ResultSetHeader>(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
      [input.email, await hashPassword(input.password), input.name, input.role],
    )
    userId = result.insertId
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'An account with this email already exists. Try logging in.' })
      return
    }
    throw err
  }
  limits.signupsPerIp.hit(ip)

  await startSession(res, userId)
  res.status(201).json({ user: await ownAccount((await loadUser(userId))!) })
})

accountRoutes.post('/login', async (req, res) => {
  const ip = req.ip ?? ''
  const email = text(req.body?.email).toLowerCase()
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  const wait = Math.max(limits.loginsPerIp.retryAfter(ip), limits.failedLoginsPerEmail.retryAfter(email))
  if (wait) return tooManyAttempts(res, wait)
  limits.loginsPerIp.hit(ip)

  const [rows] = await db.execute<UserRow[]>('SELECT * FROM users WHERE email = ?', [email])
  const user = rows[0]
  if (!(await verifyPassword(password, user?.password_hash))) {
    limits.failedLoginsPerEmail.hit(email)
    res.status(401).json({ error: 'Wrong email or password.' })
    return
  }
  limits.failedLoginsPerEmail.reset(email)

  await startSession(res, user.id)
  res.json({ user: await ownAccount(user) })
})

accountRoutes.get('/me', async (req, res) => {
  const user = await currentUser(req)
  res.json({ user: user ? await ownAccount(user) : null })
})

accountRoutes.post('/logout', async (req, res) => {
  await endSession(req, res)
  res.status(204).end()
})

// Your name and phone number. The phone number is shown only to people you have a project with.
accountRoutes.put('/me', requireUser, async (req, res) => {
  const user = me(res)
  const name = text(req.body?.name)
  const phone = text(req.body?.phone)
  if (!name || name.length > NAME_MAX) return badRequest(res, 'Please enter your name.')
  if (phone.length > PHONE_MAX || (phone && !/^[\d\s()+.-]+$/.test(phone))) {
    return badRequest(res, 'Please enter a valid phone number, or leave it empty.')
  }
  await db.execute('UPDATE users SET name = ?, phone = ? WHERE id = ?', [name, phone || null, user.id])
  res.json({ user: await ownAccount((await loadUser(user.id))!) })
})

accountRoutes.put('/me/password', requireUser, async (req, res) => {
  const user = me(res)
  const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''
  if (!(await verifyPassword(current, user.password_hash))) return badRequest(res, 'Your current password is wrong.')
  const problem = passwordProblem(req.body?.newPassword)
  if (problem) return badRequest(res, problem)

  await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [
    await hashPassword(req.body.newPassword),
    user.id,
  ])
  // Log out every other browser, in case someone else knew the old password.
  await db.execute('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [
    user.id,
    hashToken(sessionToken(req) ?? ''),
  ])
  res.status(204).end()
})
