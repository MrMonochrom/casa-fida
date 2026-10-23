// Emails about things that happen on Casa Fida, so projects keep moving when people aren't in the app.
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { isLanguage } from '../shared/languages.ts'
import type { Currency } from '../shared/money.ts'
import { db } from './db.ts'
import { messagesIn } from './i18n/index.ts'
import type { ServerMessages } from './i18n/index.ts'
import { appUrl, sendEmail } from './mailer.ts'

/** The kinds of email people can turn off in Account. */
export type EmailKind = 'quotes' | 'projects' | 'messages'

const WANTS: Record<EmailKind, string> = {
  quotes: 'email_quotes',
  projects: 'email_projects',
  messages: 'email_messages',
}

type Write = (m: ServerMessages['notifications']) => { subject: string; text: string }

const sending = new Set<Promise<void>>()

/**
 * Emails someone about something that happened, in the language they use the app in, with a link
 * to it. Only to a confirmed address, and only if they want that kind of email. It doesn't hold up
 * the request it's sent from; if it fails, that's logged.
 */
export function notify(userId: number | null | undefined, kind: EmailKind, write: Write, path: string) {
  if (!userId) return
  const email: Promise<void> = (async () => {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT email, language, email_verified_at, ${WANTS[kind]} AS wanted FROM users WHERE id = ?`,
      [userId],
    )
    const to = rows[0]
    if (!to || !to.email_verified_at || !to.wanted) return
    const m = messagesIn(isLanguage(to.language) ? to.language : 'en').notifications
    const { subject, text } = write(m)
    await sendEmail({
      to: to.email,
      subject,
      text: [text, '', m.open, `${appUrl()}${path}`, '', m.settings, `${appUrl()}/account`].join('\n'),
    })
  })()
    .catch((err) => console.error('Notification email failed:', err))
    .finally(() => sending.delete(email))
  sending.add(email)
}

/** Waits for the emails still being sent. For tests. */
export async function notificationsSent() {
  while (sending.size) await Promise.all(sending)
}

interface OverdueRow extends RowDataPacket {
  id: number
  number: number
  amount: number
  due_date: string
  project_id: number
  title: string
  currency: Currency
  client_id: number
  business_name: string
}

/** Emails clients about invoices that just became overdue, once each. */
export async function sendOverdueReminders() {
  const [rows] = await db.execute<OverdueRow[]>(
    `SELECT i.id, i.number, i.amount, i.due_date, p.id AS project_id, p.title, p.currency, p.client_id,
            COALESCE(b.business_name, u.name) AS business_name
     FROM invoices i
     JOIN projects p ON p.id = i.project_id
     JOIN users u ON u.id = p.builder_id
     LEFT JOIN builder_profiles b ON b.user_id = p.builder_id
     WHERE i.status = 'due' AND i.due_date < CURDATE() AND i.overdue_reminded_at IS NULL AND p.client_id IS NOT NULL`,
  )
  for (const r of rows) {
    // Marked before sending, so a second server checking at the same moment doesn't send it too.
    const [marked] = await db.execute<ResultSetHeader>(
      'UPDATE invoices SET overdue_reminded_at = NOW() WHERE id = ? AND overdue_reminded_at IS NULL',
      [r.id],
    )
    if (marked.affectedRows === 0) continue
    notify(
      r.client_id,
      'projects',
      (m) => m.invoiceOverdue(r.business_name, r.number, r.title, r.amount, r.currency, r.due_date),
      `/projects/${r.project_id}?tab=money`,
    )
  }
}

const HOUR = 60 * 60 * 1000

/** Checks for overdue invoices now and every hour. Started by index.ts, not in tests. */
export function startReminders() {
  const check = () => sendOverdueReminders().catch((err) => console.error('Overdue reminders failed:', err))
  setTimeout(check, 10_000)
  setInterval(check, HOUR)
}
