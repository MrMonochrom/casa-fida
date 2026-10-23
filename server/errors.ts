import { inEnglish } from './i18n/index.ts'
import type { Text } from './i18n/index.ts'

/**
 * An error whose message is meant for the person using the app, like "This job is no longer open."
 * Throw it from a route (or a transaction inside one) and the app answers with its status and
 * message, in the person's language.
 */
export class HttpError extends Error {
  readonly status: number
  readonly text: Text

  constructor(status: number, text: Text) {
    super(inEnglish(text))
    this.status = status
    this.text = text
  }
}

export const notFound = (text: Text) => new HttpError(404, text)
export const conflict = (text: Text) => new HttpError(409, text)
export const forbidden = (text: Text) => new HttpError(403, text)
