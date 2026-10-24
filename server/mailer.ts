import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
const from = process.env.MAIL_FROM || 'Casa Fida <no-reply@casafida.local>'

// Without SMTP_URL, each email can also be written to this folder as a JSON file. The browser tests
// (e2e/) read them there to open links, like the one that confirms an email address.
const mailDir = transport ? null : process.env.MAIL_DIR || null
if (mailDir) mkdirSync(mailDir, { recursive: true })
let written = 0

export async function sendEmail(email: Email) {
  if (transport) {
    await transport.sendMail({ from, ...email })
    return
  }
  outbox.push(email)
  if (outbox.length > 100) outbox.shift()
  if (mailDir) {
    // Named so they sort in the order they were sent, and renamed into place so no one reads half a file.
    const name = join(mailDir, `${Date.now()}-${String(++written).padStart(6, '0')}`)
    writeFileSync(`${name}.tmp`, JSON.stringify({ ...email, sentAt: Date.now() }))
    renameSync(`${name}.tmp`, `${name}.json`)
  }
  if (process.env.NODE_ENV !== 'test') {
    console.log(`\n📧 Email to ${email.to} (not sent: SMTP_URL isn't set)\nSubject: ${email.subject}\n\n${email.text}\n`)
  }
}

/** Where the app runs, for links in emails. */
export function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:5174').replace(/\/+$/, '')
}

export const emailIsSetUp = () => transport !== null
