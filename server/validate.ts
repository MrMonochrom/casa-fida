import type { Response } from 'express'
import { AMOUNT_MAX_CENTS, PASSWORD_MAX, PASSWORD_MIN } from '../shared/rules.ts'
import { say } from './i18n/index.ts'
import type { Text } from './i18n/index.ts'

/** A trimmed string, or '' for anything that isn't a string. */
export const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Like text, but keeps the line breaks people type in longer text while trimming the ends. */
export const longText = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''

export function isEmail(value: string): boolean {
  return value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/** What's wrong with a new password, or null if it's fine. */
export function passwordProblem(password: unknown): Text | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return (m) => m.account.passwordTooShort
  if (password.length > PASSWORD_MAX) return (m) => m.account.passwordTooLong
  return null
}

/** A positive whole number from a URL parameter or JSON field, or null. */
export function idFrom(value: unknown): number | null {
  const n = Number(value)
  return typeof value !== 'boolean' && value !== '' && Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * An amount in cents from JSON, or null if it isn't a whole number of cents within the limit.
 * Zero and negative amounts are only allowed when asked for.
 */
export function amountFrom(value: unknown, { allowZero = false, allowNegative = false } = {}): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null
  if (Math.abs(value) > AMOUNT_MAX_CENTS) return null
  if (value === 0 && !allowZero) return null
  if (value < 0 && !allowNegative) return null
  return value
}

/** A whole number between min and max, or null. */
export function wholeFrom(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : null
}

/** A real calendar date as 'YYYY-MM-DD', or null. */
export function dateFrom(value: unknown): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value))
  if (!match) return null
  const [y, m, d] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  if (y < 2000 || y > 2100) return null
  return match[0]
}

/** What a read* function returns when the input has a problem: { error } with the message to show. */
export const invalid = (error: Text) => ({ error })

/** Answers 400 with a readable message, in the person's language. */
export function badRequest(res: Response, error: Text) {
  fail(res, 400, error)
}

/** Answers with any status and a readable message, in the person's language. */
export function fail(res: Response, status: number, error: Text) {
  res.status(status).json({ error: say(res.req, error) })
}
