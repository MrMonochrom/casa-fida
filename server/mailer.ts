import nodemailer from 'nodemailer'

export interface Email {
  to: string
  subject: string
  text: string
}

/**
 * Emails "sent" while no email service is set up: printed in the terminal (in development) and kept
 * here, newest last, so tests can read them.
 */
export const outbox: Email[] = []

// Any SMTP provider works, for example smtps://user:password@smtp.example.com:465
const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null
// || rather than ??: an empty setting (as Docker Compose passes for unset ones) counts as unset.
const from = process.env.MAIL_FROM || 'BuildBridge <no-reply@buildbridge.local>'

export async function sendEmail(email: Email) {
  if (transport) {
    await transport.sendMail({ from, ...email })
    return
  }
  outbox.push(email)
  if (outbox.length > 100) outbox.shift()
  if (process.env.NODE_ENV !== 'test') {
    console.log(`\n📧 Email to ${email.to} (not sent: SMTP_URL isn't set)\nSubject: ${email.subject}\n\n${email.text}\n`)
  }
}

/** Where the app runs, for links in emails. */
export function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:5174').replace(/\/+$/, '')
}

export const emailIsSetUp = () => transport !== null
