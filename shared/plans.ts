// Builder plans. Free stays as useful as Casa Fida has always been; Pro adds speed and room for
// busier firms. Clients don't have plans. The server enforces these; the app shows them.

export const PLANS = ['free', 'pro'] as const
export type Plan = (typeof PLANS)[number]

export interface PlanLimits {
  /** Trades a builder can offer. */
  trades: number
  /** New quotes a builder can send in a day (changing a quote doesn't count). */
  newQuotesPerDay: number
  /** How they hear about new jobs in their trades: as each is posted, or in one email a day. */
  jobAlerts: 'instant' | 'daily'
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { trades: 6, newQuotesPerDay: 30, jobAlerts: 'daily' },
  pro: { trades: 12, newQuotesPerDay: 100, jobAlerts: 'instant' },
}

/** A builder can try Pro once, for this long. */
export const TRIAL_DAYS = 14
