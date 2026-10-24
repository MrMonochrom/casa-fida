// Confirming that people own the email address they signed up with. Until they do, proposals sent
// to that address don't go straight into their account, builders can't send proposals, and a
// client's jobs aren't emailed to builders.
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { Language } from '../shared/languages.ts'
import { hashToken, newSessionToken } from './auth.ts'
import { db } from './db.ts'
import { publish } from './events.ts'
import { messagesIn } from './i18n/index.ts'
import { appUrl, sendEmail } from './mailer.ts'
import { sendJobAlerts } from './notifications.ts'
import type { UserRow } from './users.ts'

/** How long a confirmation link works. */
const LINK_DAYS = 7

/**
 * Emails the person a new confirmation link; an older one stops working. The email has only fixed
 * text, never anything someone typed, so signing up can't be used to send other people messages.
 */
export async function sendVerificationEmail(user: Pick<UserRow, 'id' | 'email'>, language: Language) {
  const token = newSessionToken()
  await db.execute('UPDATE users SET verify_token_hash = ?, verify_expires_at = NOW() + INTERVAL ? DAY WHERE id = ?', [
    hashToken(token),
    LINK_DAYS,
    user.id,
  ])
  const say = messagesIn(language).verifyEmail
  await sendEmail({
    to: user.email,
    subject: say.subject,
    text: [say.intro, '', `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`, '', say.ignore].join('\n'),
  })
}

/** The person whose confirmation link has this token, while it still works. */
export async function userForVerifyToken(token: string): Promise<UserRow | null> {
  if (!token || token.length > 100) return null
  const [rows] = await db.execute<UserRow[]>(
    'SELECT * FROM users WHERE verify_token_hash = ? AND verify_expires_at > NOW()',
    [hashToken(token)],
  )
  return rows[0] ?? null
}

/**
 * Marks the person's email address as theirs: from a confirmation link, a password reset link, or
 * the invite link in a proposal email (not one the builder asked for: they could open it themselves).
 * Proposals sent to the address in the meantime go into their account, as they would have straight away.
 */
export async function confirmEmail(user: Pick<UserRow, 'id' | 'email' | 'role'>) {
  const [confirmed] = await db.execute<ResultSetHeader>(
    'UPDATE users SET email_verified_at = NOW() WHERE id = ? AND email_verified_at IS NULL',
    [user.id],
  )
  if (user.role !== 'client') return
  // Jobs they posted before confirming weren't sent to builders on Pro yet.
  if (confirmed.affectedRows > 0) {
    const [jobs] = await db.execute<RowDataPacket[]>(
      "SELECT id, title, location, trade FROM jobs WHERE client_id = ? AND status = 'open'",
      [user.id],
    )
    for (const job of jobs) sendJobAlerts(job as { id: number; title: string; location: string; trade: string })
  }
  const [waiting] = await db.execute<RowDataPacket[]>(
    "SELECT id, builder_id FROM projects WHERE client_email = ? AND client_id IS NULL AND status = 'proposed'",
    [user.email],
  )
  if (waiting.length === 0) return
  // The invite links in those emails keep working, and open the proposal now in the account.
  await db.execute(
    "UPDATE projects SET client_id = ? WHERE client_email = ? AND client_id IS NULL AND status = 'proposed'",
    [user.id, user.email],
  )
  for (const project of waiting) publish(project.builder_id as number, { type: 'project', projectId: project.id as number })
}
