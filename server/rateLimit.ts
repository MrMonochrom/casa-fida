import type { Response } from 'express'
import { fail } from './validate.ts'

const limiters = new Set<Limiter>()

/**
 * Counts attempts per key (an IP address, an email…) within a time window. The counts live in this
 * server's memory, which is enough for one server process; they start again after a restart.
 */
export class Limiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>()
  private readonly max: number
  private readonly windowMs: number

  constructor(max: number, windowMs: number) {
    this.max = max
    this.windowMs = windowMs
    limiters.add(this)
  }

  /** Seconds until `key` may try again, or 0 if it may try now. */
  retryAfter(key: string): number {
    if (process.env.RATE_LIMITS === 'off') return 0
    const entry = this.attempts.get(key)
    if (!entry || entry.resetAt <= Date.now() || entry.count < this.max) return 0
    return Math.ceil((entry.resetAt - Date.now()) / 1000)
  }

  hit(key: string) {
    const now = Date.now()
    const entry = this.attempts.get(key)
    if (entry && entry.resetAt > now) entry.count++
    else this.attempts.set(key, { count: 1, resetAt: now + this.windowMs })
    // Forget finished windows now and then, so memory doesn't grow forever.
    if (this.attempts.size > 10_000) {
      for (const [k, e] of this.attempts) if (e.resetAt <= now) this.attempts.delete(k)
    }
  }

  reset(key: string) {
    this.attempts.delete(key)
  }

  clear() {
    this.attempts.clear()
  }
}

/** Forgets every attempt everywhere. For tests. */
export function resetRateLimits() {
  for (const limiter of limiters) limiter.clear()
}

const MINUTE = 60 * 1000

/** Answers 429 with a friendly wait time. */
export function tooManyAttempts(res: Response, seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  res.set('Retry-After', String(seconds))
  fail(res, 429, (m) => m.general.tooManyAttempts(minutes))
}

// The limits themselves, in one place.
export const limits = {
  /** Any login attempt from one IP address. */
  loginsPerIp: new Limiter(30, 15 * MINUTE),
  /** Wrong passwords for one account, from anywhere. A right password clears the count. */
  failedLoginsPerEmail: new Limiter(5, 15 * MINUTE),
  /** New accounts from one IP address. */
  signupsPerIp: new Limiter(10, 60 * MINUTE),
  /** Invite emails one builder can send. */
  invitesPerBuilder: new Limiter(30, 60 * MINUTE),
}
