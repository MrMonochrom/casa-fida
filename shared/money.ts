// Money is stored and sent as whole cents (or euro cents, bani, kopecks), so sums never pick up
// rounding errors. Each job and project has its own currency; every amount on it is in that one.
import { LOCALES } from './languages.ts'
import type { Language } from './languages.ts'

/** The currencies jobs and projects can be priced in. Each has 100 smaller units, like cents. */
export const CURRENCIES = ['USD', 'EUR', 'MDL', 'RON', 'RUB'] as const
export type Currency = (typeof CURRENCIES)[number]
export const isCurrency = (value: unknown): value is Currency =>
  typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value)

/** For jobs and projects that were made before there was a choice. */
export const DEFAULT_CURRENCY: Currency = 'USD'

// The Moldovan and the Romanian leu are both written "lei", so those two are shown by their code.
const BY_CODE: readonly Currency[] = ['MDL', 'RON']

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: Currency, language: Language, cents: boolean) {
  const key = `${currency}${language}${cents}`
  let found = formatters.get(key)
  if (!found) {
    found = new Intl.NumberFormat(LOCALES[language], {
      style: 'currency',
      currency,
      currencyDisplay: BY_CODE.includes(currency) ? 'code' : 'narrowSymbol',
      ...(cents ? {} : { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    })
    formatters.set(key, found)
  }
  return found
}

/**
 * "$1,250" for whole amounts, "$1,250.50" otherwise. Each language writes it its own way:
 * "1.250,50 €" in Romanian, "1 250 ₽" in Russian, "MDL 1,250" in English.
 */
export function formatMoney(cents: number, currency: Currency, language: Language = 'en'): string {
  return formatter(currency, language, cents % 100 !== 0).format(cents / 100)
}

/** "+$3,200" or "−$500": a change to a price. */
export function formatChange(cents: number, currency: Currency, language: Language = 'en'): string {
  if (cents === 0) return formatMoney(0, currency, language)
  return `${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents), currency, language)}`
}

/** What goes in front of an amount box: "$", "€", "₽", "MDL" or "RON". */
export function currencySign(currency: Currency, language: Language = 'en'): string {
  const parts = formatter(currency, language, false).formatToParts(0)
  return parts.find((p) => p.type === 'currency')?.value ?? currency
}

/**
 * Reads an amount typed by a person into cents. Either "," or "." can separate the cents, since
 * Romanian and Russian use a comma: "1,250", "$1250.5", "1.250,50", "1 250,5" and "-500" all work.
 * A separator followed by one or two digits at the end starts the cents; followed by three, it
 * groups thousands. Returns null for anything else.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.trim().replace(/[\s$€₽']/g, '').replace(/^−/, '-')
  const match = /^(-?)(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const [, sign, whole, fraction = ''] = match
  const cents = Number(whole.replace(/[.,]/g, '')) * 100 + Number(fraction.padEnd(2, '0'))
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
