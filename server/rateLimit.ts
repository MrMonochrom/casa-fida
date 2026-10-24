import type { Response } from 'express'
import { PLAN_LIMITS } from '../shared/plans.ts'
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

  /**
   * Seconds until `key` may try again, or 0 if it may try now. `max` overrides the limit for this
   * key, for limits that depend on who's asking (like a builder's plan) but count in one place.
   */
  retryAfter(key: string, max = this.max): number {
    if (process.env.RATE_LIMITS === 'off') return 0
    const entry = this.attempts.get(key)
    if (!entry || entry.resetAt <= Date.now() || entry.count < max) return 0
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

const DAY = 24 * 60 * MINUTE

// The limits themselves, in one place.
export const limits = {
  /** Any login attempt from one IP address. */
  loginsPerIp: new Limiter(30, 15 * MINUTE),
  /**
   * Wrong passwords for one account from one IP address. Counted per address, so someone guessing
   * can't lock the owner out from their own. A right password clears the count for that address.
   */
  failedLoginsPerEmailAndIp: new Limiter(5, 15 * MINUTE),
  /**
   * Wrong passwords for one account from anywhere: a backstop against guessing from many addresses.
   * One address can't reach it alone (it stops at 20 an hour), so it can't be used to lock people out.
   */
  failedLoginsPerEmail: new Limiter(30, 60 * MINUTE),
  /** New accounts from one IP address. */
  signupsPerIp: new Limiter(10, 60 * MINUTE),
  /** Proposal emails one builder can send, in an hour and in a day. */
  invitesPerBuilder: new Limiter(20, 60 * MINUTE),
  invitesPerBuilderPerDay: new Limiter(50, DAY),
  /** Confirmation emails one person can ask for again. */
  verificationEmailsPerUser: new Limiter(5, 60 * MINUTE),
  /** Password reset emails: asked for from one IP address, and sent to one address. */
  passwordResetsPerIp: new Limiter(10, 60 * MINUTE),
  passwordResetsPerEmail: new Limiter(3, 60 * MINUTE),
  /** Jobs one client can post in a day: each one emails the builders on Pro in its trade. */
  jobsPerClientPerDay: new Limiter(5, DAY),
  /**
   * New quotes one builder can send in a day (each one emails a client). One count whatever their
   * plan; the limit is their plan's at the time (PLAN_LIMITS), so changing plan mid-day doesn't
   * start the count again.
   */
  newQuotesPerBuilderPerDay: new Limiter(PLAN_LIMITS.free.newQuotesPerDay, DAY),
}
