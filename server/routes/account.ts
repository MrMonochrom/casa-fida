import express from 'express'
import type { ResultSetHeader } from 'mysql2/promise'
import { NAME_MAX, ROLES } from '../../shared/rules.ts'
import type { Role } from '../../shared/rules.ts'
import { db } from '../db.ts'
import { hashPassword, hashToken, verifyPassword } from '../auth.ts'
import { closeStreams } from '../events.ts'
import { chosenLanguage, languageOf } from '../i18n/index.ts'
import { limits, tooManyAttempts } from '../rateLimit.ts'
import { currentUser, endSession, me, requireRole, requireUser, sessionToken, startSession } from '../session.ts'
import { loadUser, ownAccount, planOf } from '../users.ts'
import { TRIAL_DAYS } from '../../shared/plans.ts'
import type { UserRow } from '../users.ts'
import { badRequest, fail, invalid, isEmail, passwordProblem, text } from '../validate.ts'
import { confirmEmail, sendVerificationEmail, userForVerifyToken } from '../verification.ts'
import { sendPasswordResetEmail, userForResetToken } from '../passwordReset.ts'

export const accountRoutes = express.Router()

const PHONE_MAX = 40

function readSignup(body: Record<string, unknown>) {
  const name = text(body.name)
  const email = text(body.email).toLowerCase()
  const role = body.role as Role

  if (!ROLES.includes(role)) return invalid((m) => m.account.chooseRole)
  if (!name || name.length > NAME_MAX) return invalid((m) => m.account.enterName)
  if (!isEmail(email)) return invalid((m) => m.account.enterEmail)
  const problem = passwordProblem(body.password)
  if (problem) return invalid(problem)

  return { name, email, role, password: body.password as string }
}

// Creates an account and logs in, and emails a link to confirm the address. Builders set up their
// business profile next.
accountRoutes.post('/signup', async (req, res) => {
  const ip = req.ip ?? ''
  const wait = limits.signupsPerIp.retryAfter(ip)
  if (wait) return tooManyAttempts(res, wait)

  const input = readSignup(req.body ?? {})
  if ('error' in input) return badRequest(res, input.error)

  let userId: number
  try {
    const [result] = await db.execute<ResultSetHeader>(
      'INSERT INTO users (email, password_hash, name, role, language) VALUES (?, ?, ?, ?, ?)',
      [input.email, await hashPassword(input.password), input.name, input.role, languageOf(req)],
    )
    userId = result.insertId
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      fail(res, 409, (m) => m.account.emailTaken)
      return
    }
    throw err
  }
  limits.signupsPerIp.hit(ip)

  await sendVerificationEmail({ id: userId, email: input.email }, languageOf(req)).catch((err) =>
    console.error('Confirmation email failed:', err),
  )
  await startSession(res, userId)
  res.status(201).json({ user: await ownAccount((await loadUser(userId))!) })
})

accountRoutes.post('/login', async (req, res) => {
  const ip = req.ip ?? ''
  const email = text(req.body?.email).toLowerCase()
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  const emailAndIp = `${email} ${ip}`
  const wait = Math.max(
    limits.loginsPerIp.retryAfter(ip),
    limits.failedLoginsPerEmailAndIp.retryAfter(emailAndIp),
    limits.failedLoginsPerEmail.retryAfter(email),
  )
  if (wait) return tooManyAttempts(res, wait)
  limits.loginsPerIp.hit(ip)

  const [rows] = await db.execute<UserRow[]>('SELECT * FROM users WHERE email = ?', [email])
  const user = rows[0]
  if (!(await verifyPassword(password, user?.password_hash))) {
    limits.failedLoginsPerEmailAndIp.hit(emailAndIp)
    limits.failedLoginsPerEmail.hit(email)
    fail(res, 401, (m) => m.account.wrongLogin)
    return
  }
  limits.failedLoginsPerEmailAndIp.reset(emailAndIp)
  const language = chosenLanguage(req)
  if (language) await db.execute('UPDATE users SET language = ? WHERE id = ?', [language, user.id])

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
  if (!name || name.length > NAME_MAX) return badRequest(res, (m) => m.account.enterName)
  if (phone.length > PHONE_MAX || (phone && !/^[\d\s()+.-]+$/.test(phone))) {
    return badRequest(res, (m) => m.account.enterPhone)
  }
  await db.execute('UPDATE users SET name = ?, phone = ? WHERE id = ?', [name, phone || null, user.id])
  res.json({ user: await ownAccount((await loadUser(user.id))!) })
})

accountRoutes.put('/me/password', requireUser, async (req, res) => {
  const user = me(res)
  const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''
  if (!(await verifyPassword(current, user.password_hash))) return badRequest(res, (m) => m.account.wrongPassword)
  const problem = passwordProblem(req.body?.newPassword)
  if (problem) return badRequest(res, problem)

  await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [
    await hashPassword(req.body.newPassword),
    user.id,
  ])
  // Log out every other browser, in case someone else knew the old password.
  const thisSession = hashToken(sessionToken(req) ?? '')
  await db.execute('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [user.id, thisSession])
  closeStreams(user.id, { except: thisSession })
  // A reset link sent before this would undo it.
  await db.execute('UPDATE users SET reset_token_hash = NULL, reset_expires_at = NULL WHERE id = ?', [user.id])
  res.status(204).end()
})

// Which emails you get about things that happen while you're away.
accountRoutes.put('/me/notifications', requireUser, async (req, res) => {
  const user = me(res)
  const wants = (key: string) => req.body?.[key] !== false
  await db.execute(
    'UPDATE users SET email_quotes = ?, email_projects = ?, email_messages = ?, email_jobs = ? WHERE id = ?',
    [wants('quotes'), wants('projects'), wants('messages'), wants('jobs'), user.id],
  )
  res.json({ user: await ownAccount((await loadUser(user.id))!) })
})

// Starts a builder's one free trial of Pro. Paying for Pro comes once online payments are set up.
accountRoutes.post('/me/plan/trial', requireRole('builder'), async (_req, res) => {
  const user = me(res)
  if ((await planOf(user.id)) === 'pro') return fail(res, 409, (m) => m.plans.alreadyPro)
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE users SET plan = 'pro', plan_ends_at = NOW() + INTERVAL ? DAY, trial_used_at = NOW()
     WHERE id = ? AND trial_used_at IS NULL`,
    [TRIAL_DAYS, user.id],
  )
  if (result.affectedRows === 0) return fail(res, 409, (m) => m.plans.trialUsed)
  res.json({ user: await ownAccount((await loadUser(user.id))!) })
})

// ---------- Forgotten passwords ----------

// Emails a link to choose a new password. The answer is the same whether or not an account uses the
// address, so this can't be used to find out who has one.
accountRoutes.post('/password-reset', async (req, res) => {
  const ip = req.ip ?? ''
  const email = text(req.body?.email).toLowerCase()
  if (!isEmail(email)) return badRequest(res, (m) => m.account.enterEmail)
  const wait = Math.max(limits.passwordResetsPerIp.retryAfter(ip), limits.passwordResetsPerEmail.retryAfter(email))
  if (wait) return tooManyAttempts(res, wait)
  limits.passwordResetsPerIp.hit(ip)
  limits.passwordResetsPerEmail.hit(email)

  const [rows] = await db.execute<UserRow[]>('SELECT * FROM users WHERE email = ?', [email])
  if (rows[0]) {
    await sendPasswordResetEmail(rows[0], languageOf(req)).catch((err) => console.error('Password reset email failed:', err))
  }
  res.status(204).end()
})

// Sets a new password from a reset link, logs out everywhere else and logs in here. Opening the
// link proves the email is theirs, so it also counts as confirming it.
accountRoutes.post('/password-reset/confirm', async (req, res) => {
  const user = await userForResetToken(text(req.body?.token))
  if (!user) return fail(res, 404, (m) => m.account.resetLinkGone)
  const problem = passwordProblem(req.body?.password)
  if (problem) return badRequest(res, problem)

  await db.execute(
    'UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL WHERE id = ?',
    [await hashPassword(req.body.password), user.id],
  )
  await db.execute('DELETE FROM sessions WHERE user_id = ?', [user.id])
  closeStreams(user.id, { except: '' })
  limits.failedLoginsPerEmail.reset(user.email)
  await confirmEmail(user)
  await startSession(res, user.id)
  res.json({ user: await ownAccount((await loadUser(user.id))!) })
})

// Confirms an email address from the link in the confirmation email. Works without logging in:
// the link is the proof.
accountRoutes.post('/verify-email', async (req, res) => {
  const user = await userForVerifyToken(text(req.body?.token))
  if (!user) return fail(res, 404, (m) => m.account.verifyLinkGone)
  await db.execute('UPDATE users SET verify_token_hash = NULL, verify_expires_at = NULL WHERE id = ?', [user.id])
  await confirmEmail(user)
  res.json({ email: user.email })
})

// Sends the confirmation email again, with a new link.
accountRoutes.post('/me/verify-email', requireUser, async (req, res) => {
  const user = me(res)
  if (user.email_verified_at) return fail(res, 409, (m) => m.account.alreadyConfirmed)
  const key = String(user.id)
  const wait = limits.verificationEmailsPerUser.retryAfter(key)
  if (wait) return tooManyAttempts(res, wait)
  limits.verificationEmailsPerUser.hit(key)
  await sendVerificationEmail(user, languageOf(req))
  res.status(204).end()
})
