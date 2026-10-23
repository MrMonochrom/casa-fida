import type { Request } from 'express'

/** A cookie's value from the request, or undefined if it isn't there or can't be read. */
export function cookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=')
    if (key !== name) continue
    try {
      return decodeURIComponent(rest.join('='))
    } catch {
      // A damaged cookie counts as no cookie.
      return undefined
    }
  }
  return undefined
}
