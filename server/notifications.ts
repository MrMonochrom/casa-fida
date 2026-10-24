// Emails about things that happen on Casa Fida, so projects keep moving when people aren't in the app.
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { isLanguage } from '../shared/languages.ts'
import type { Currency } from '../shared/money.ts'
import { db } from './db.ts'
import { messagesIn } from './i18n/index.ts'
import type { ServerMessages } from './i18n/index.ts'
import { appUrl, sendEmail } from './mailer.ts'
import { isPro, tradeCovered } from './users.ts'

/** The kinds of email people can turn off in Account. */
export type EmailKind = 'quotes' | 'projects' | 'messages' | 'jobs'

const WANTS: Record<EmailKind, string> = {
  quotes: 'email_quotes',
  projects: 'email_projects',
  messages: 'email_messages',
  jobs: 'email_jobs',
}

type Write = (m: ServerMessages['notifications']) => { subject: string; text: string }

const sending = new Set<Promise<void>>()

/** Runs work after the request has its answer. Failures are logged; tests can wait for it. */
function inBackground(work: () => Promise<void>) {
  const running: Promise<void> = work()
    .catch((err) => console.error('Notification email failed:', err))
    .finally(() => sending.delete(running))
  sending.add(running)
}

/**
 * Emails someone about something that happened, in the language they use the app in, with a link
 * to it. Only to a confirmed address, and only if they want that kind of email. It doesn't hold up
 * the request it's sent from; if it fails, that's logged.
 */
export function notify(userId: number | null | undefined, kind: EmailKind, write: Write, path: string) {
  if (!userId) return
  inBackground(async () => {
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
  })
}

/**
 * Tells builders on Pro about a new job in their trades as soon as it's posted. Builders on the
 * free plan hear about it in their daily email (sendJobDigests). Called only for jobs from clients who
 * have confirmed their address, since the job's title and place are in the email.
 */
export function sendJobAlerts(job: { id: number; title: string; location: string; trade: string }) {
  inBackground(async () => {
    const [builders] = await db.execute<RowDataPacket[]>(
      `SELECT u.id FROM users u JOIN builder_trades t ON t.user_id = u.id
       WHERE t.trade = ? AND u.role = 'builder' AND ${isPro('u.')} AND ${tradeCovered()}`,
      [job.trade],
    )
    for (const builder of builders) {
      notify(builder.id as number, 'jobs', (m) => m.newJob(job.title, job.location), `/jobs/${job.id}`)
    }
  })
}

/** How many jobs a daily email lists by name; it counts the rest. */
const DIGEST_JOBS = 10

/**
 * SQL that's true for a builder who hasn't had the daily email yet today, by the database's calendar.
 * A calendar day rather than 24 hours: with a check every hour, "24 hours since the last one" would
 * often fall just after a check and push the email an hour later each time.
 */
const NO_DIGEST_TODAY = '(jobs_digest_sent_at IS NULL OR jobs_digest_sent_at < CURDATE())'

/**
 * Emails each builder on the free plan the jobs posted in their trades since their last such email,
 * at most once a calendar day and only when there's something new. Called every hour. It remembers the
 * newest job it told them about, rather than a time, so a job posted the same second isn't skipped.
 */
export async function sendJobDigests() {
  const [builders] = await db.execute<RowDataPacket[]>(
    `SELECT u.id FROM users u
     WHERE u.role = 'builder' AND u.email_jobs AND u.email_verified_at IS NOT NULL AND NOT ${isPro('u.')}
       AND ${NO_DIGEST_TODAY}`,
  )
  for (const builder of builders) {
    const [jobs] = await db.execute<RowDataPacket[]>(
      `SELECT j.id, j.title, j.location FROM jobs j JOIN users u ON u.id = ? JOIN users c ON c.id = j.client_id
       WHERE j.status = 'open' AND c.email_verified_at IS NOT NULL
         AND j.trade IN (SELECT t.trade FROM builder_trades t WHERE t.user_id = u.id AND ${tradeCovered()})
         AND IF(u.jobs_digest_last_job_id IS NULL, j.created_at > NOW() - INTERVAL 1 DAY, j.id > u.jobs_digest_last_job_id)
         AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.job_id = j.id AND q.builder_id = u.id)
       ORDER BY j.id DESC`,
      [builder.id],
    )
    if (jobs.length === 0) continue
    // Marked before sending, so a second server checking at the same moment doesn't send it too.
    const [marked] = await db.execute<ResultSetHeader>(
      `UPDATE users SET jobs_digest_sent_at = NOW(), jobs_digest_last_job_id = ?
       WHERE id = ? AND ${NO_DIGEST_TODAY}`,
      [jobs[0].id, builder.id],
    )
    if (marked.affectedRows === 0) continue
    const listed = jobs.slice(0, DIGEST_JOBS).map((j) => ({ title: j.title as string, location: j.location as string }))
    notify(builder.id as number, 'jobs', (m) => m.jobDigest(listed, jobs.length), '/jobs')
  }
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

/** Checks for overdue invoices and daily job emails now and every hour. Started by index.ts, not in tests. */
export function startReminders() {
  const check = () => {
    sendOverdueReminders().catch((err) => console.error('Overdue reminders failed:', err))
    sendJobDigests().catch((err) => console.error('Daily job emails failed:', err))
  }
  setTimeout(check, 10_000)
  setInterval(check, HOUR)
}
