// Rules that both the app and the server use. The server enforces them; the app uses the same
// values for its hints and checks, so the two can't drift apart.

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 200

export const ROLES = ['client', 'builder'] as const
export type Role = (typeof ROLES)[number]

/** The kinds of work builders offer and jobs ask for. The key is stored; the label is shown. */
export const TRADES = {
  new_homes: 'New homes',
  extensions: 'Extensions',
  renovations: 'Renovations',
  kitchens: 'Kitchens',
  bathrooms: 'Bathrooms',
  roofing: 'Roofing',
  basements_attics: 'Basements & attics',
  decks_landscaping: 'Decks & landscaping',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  painting: 'Painting',
  carpentry: 'Carpentry',
  flooring: 'Flooring',
  windows_doors: 'Windows & doors',
} as const
export type Trade = keyof typeof TRADES
export const TRADE_KEYS = Object.keys(TRADES) as Trade[]
// Object.hasOwn rather than `in`, so names every object has, like "constructor", don't count.
export const isTrade = (value: unknown): value is Trade => typeof value === 'string' && Object.hasOwn(TRADES, value)
// How many trades a builder can offer depends on their plan: see shared/plans.ts.

/** When a client wants a job to start. */
export const JOB_TIMINGS = {
  asap: 'As soon as possible',
  within_3_months: 'Within 3 months',
  within_6_months: 'Within 6 months',
  flexible: "I'm flexible",
} as const
export type JobTiming = keyof typeof JOB_TIMINGS
export const isJobTiming = (value: unknown): value is JobTiming =>
  typeof value === 'string' && Object.hasOwn(JOB_TIMINGS, value)

// Text limits.
export const NAME_MAX = 100
export const BUSINESS_NAME_MAX = 120
export const HEADLINE_MAX = 160
export const ABOUT_MAX = 3000
export const PLACE_MAX = 120
export const TITLE_MAX = 120
export const DESCRIPTION_MAX = 4000
export const QUOTE_MESSAGE_MAX = 2000
export const UPDATE_MAX = 4000
export const MESSAGE_MAX = 2000
export const REVIEW_MAX = 2000
export const STAGE_NAME_MAX = 80
export const STAGES_MAX = 30

/**
 * Every amount is kept in cents. This is the largest single amount anywhere: 100 million, in any
 * currency, so a house priced in rubles fits too.
 */
export const AMOUNT_MAX_CENTS = 10_000_000_000

/** Longest time a quote can promise, and the most days a change order can add or remove. */
export const QUOTE_WEEKS_MAX = 260
export const CHANGE_DAYS_MAX = 365

/** Photos on one project update, and the largest upload. The app shrinks photos well below this. */
export const PHOTOS_PER_UPDATE = 6
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024

/** Stage names a builder can add with one click. */
export const STAGE_SUGGESTIONS = [
  'Permits & design',
  'Site prep',
  'Demolition',
  'Foundation',
  'Framing',
  'Roofing',
  'Plumbing & electrical',
  'Insulation & drywall',
  'Kitchen & bathrooms',
  'Flooring',
  'Painting & finishes',
  'Final inspection',
]
