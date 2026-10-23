// Choosing a new password with a link sent by email, for people who forgot theirs.
import type { Language } from '../shared/languages.ts'
import { hashToken, newSessionToken } from './auth.ts'
import { db } from './db.ts'
import { messagesIn } from './i18n/index.ts'
import { appUrl, sendEmail } from './mailer.ts'
import type { UserRow } from './users.ts'

/** How long a reset link works. Short, since it's as good as the password. */
const LINK_MINUTES = 60

/** Emails the person a link to choose a new password; an older one stops working. */
export async function sendPasswordResetEmail(user: Pick<UserRow, 'id' | 'email'>, language: Language) {
  const token = newSessionToken()
  await db.execute(
    'UPDATE users SET reset_token_hash = ?, reset_expires_at = NOW() + INTERVAL ? MINUTE WHERE id = ?',
    [hashToken(token), LINK_MINUTES, user.id],
  )
  const say = messagesIn(language).passwordResetEmail
  await sendEmail({
    to: user.email,
    subject: say.subject,
    text: [say.intro, '', `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`, '', say.ignore].join('\n'),
  })
}

/** The person whose reset link has this token, while it still works. */
export async function userForResetToken(token: string): Promise<UserRow | null> {
  if (!token || token.length > 100) return null
  const [rows] = await db.execute<UserRow[]>(
    'SELECT * FROM users WHERE reset_token_hash = ? AND reset_expires_at > NOW()',
    [hashToken(token)],
  )
  return rows[0] ?? null
}
