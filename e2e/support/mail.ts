// Reading the emails the test server "sends": it writes each one to MAIL_DIR as a JSON file.
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { MAIL_DIR } from './settings.ts'
import { settle } from './wait.ts'

export interface SentEmail {
  to: string
  subject: string
  text: string
  sentAt: number
}

/** Every email sent since the scenario started, oldest first. */
export function allEmails(): SentEmail[] {
  let names: string[]
  try {
    names = readdirSync(MAIL_DIR).filter((name) => name.endsWith('.json'))
  } catch {
    return []
  }
  return names.sort().map((name) => JSON.parse(readFileSync(join(MAIL_DIR, name), 'utf8')) as SentEmail)
}

export function clearEmails() {
  let names: string[]
  try {
    names = readdirSync(MAIL_DIR)
  } catch {
    return
  }
  for (const name of names) rmSync(join(MAIL_DIR, name), { force: true })
}

export const emailsTo = (address: string) => allEmails().filter((email) => email.to === address.toLowerCase())

/** The emails to `address` with this subject, oldest first. */
export const emailsAbout = (address: string, subject: string) =>
  emailsTo(address).filter((email) => email.subject === subject)

/** Waits for an email to `address` with this subject (they're sent in the background) and returns it. */
export async function waitForEmail(address: string, subject: string): Promise<SentEmail> {
  await settle(() => emailsAbout(address, subject).length > 0)
  // If it never came, the message lists the subjects that did.
  expect(emailsTo(address).map((email) => email.subject), `the emails sent to ${address}`).toContain(subject)
  return emailsAbout(address, subject).at(-1)!
}

/** Waits until `count` emails to `address` have this subject, and checks there aren't more. */
export async function waitForEmails(address: string, subject: string, count: number) {
  await settle(() => emailsAbout(address, subject).length >= count)
  expect(emailsAbout(address, subject), `emails to ${address} about "${subject}"`).toHaveLength(count)
}

/**
 * Checks that no email to `address` with this subject arrives. Emails go out in the background, so
 * this gives them a moment first.
 */
export async function expectNoEmail(address: string, subject: string) {
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  expect(emailsAbout(address, subject)).toEqual([])
}

/** The first link in an email: the one it's about (a later one may lead to email settings). */
export function linkIn(email: SentEmail): string {
  const link = email.text.match(/https?:\/\/\S+/)?.[0]
  if (!link) throw new Error(`No link in the email "${email.subject}":\n${email.text}`)
  return link
}
