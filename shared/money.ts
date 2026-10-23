// Money is stored and sent as whole cents, so sums never pick up rounding errors.

/** The currency every amount is in. Change it here for the whole app. */
export const CURRENCY = 'USD'

const withCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY })
const wholeOnly = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** "$1,250" for whole amounts, "$1,250.50" otherwise. */
export function formatMoney(cents: number): string {
  return cents % 100 === 0 ? wholeOnly.format(cents / 100) : withCents.format(cents / 100)
}

/** "+$3,200" or "−$500": a change to a price. */
export function formatChange(cents: number): string {
  if (cents === 0) return formatMoney(0)
  return `${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents))}`
}

/**
 * Reads an amount typed by a person, like "1,250", "$1250.5" or "-500", into cents.
 * Returns null for anything that isn't a plain amount with at most two decimals.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.trim().replace(/[\s,$]/g, '').replace(/^−/, '-')
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const [, sign, whole, fraction = ''] = match
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return sign && cents !== 0 ? -cents : cents
}

/** Cents as a plain number for an input box: 125050 → "1250.50", 120000 → "1200". */
export function moneyInputValue(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const fraction = abs % 100
  return `${sign}${Math.floor(abs / 100)}${fraction ? `.${String(fraction).padStart(2, '0')}` : ''}`
}
