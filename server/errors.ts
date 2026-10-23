/**
 * An error whose message is meant for the person using the app, like "This job is no longer open."
 * Throw it from a route (or a transaction inside one) and the app answers with its status and message.
 */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const notFound = (message: string) => new HttpError(404, message)
export const conflict = (message: string) => new HttpError(409, message)
export const forbidden = (message: string) => new HttpError(403, message)
