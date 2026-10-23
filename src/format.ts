// Turning what the API sends into words and dates people read, in the app's language.
import {
  formatChange as changeIn,
  formatMoney as moneyIn,
  moneyInputValue as inputValueIn,
  parseMoney as parseIn,
  currencySign as signIn,
} from '../shared/money'
import type { Currency } from '../shared/money'
import type { JobTiming, Trade } from '../shared/rules'
import { getLanguage, getLocale, getT } from './i18n'
import type {
  ChangeOrderStatus,
  Invoice,
  JobStatus,
  ProjectStatus,
  QuoteStatus,
  StageStatus,
} from './types'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "Oct 23, 2026" (in Romanian "23 oct. 2026") */
export function dateText(ms: number): string {
  return new Date(ms).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A 'YYYY-MM-DD' date as "Oct 23, 2026", without the timezone shifting it a day. */
export function dayDateText(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return dateText(new Date(y, m - 1, d).getTime())
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", then a date. */
export function ago(ms: number, now = Date.now()): string {
  const t = getT().time
  const diff = Math.max(0, now - ms)
  if (diff < MINUTE) return t.justNow
  if (diff < HOUR) return t.minutesAgo(Math.floor(diff / MINUTE))
  if (diff < DAY) return t.hoursAgo(Math.floor(diff / HOUR))
  const days = Math.floor(diff / DAY)
  if (days === 1) return t.yesterday
  if (days < 30) return t.daysAgo(days)
  return dateText(ms)
}

/** In English, the viewer's own clock (14:05 or 2:05 PM); otherwise that language's. */
const timeLocale = () => (getLanguage() === 'en' ? [] : getLocale())

/** "14:05" or "2:05 PM". */
export function timeText(ms: number): string {
  return new Date(ms).toLocaleTimeString(timeLocale(), { hour: 'numeric', minute: '2-digit' })
}

/** The full date and time, for tooltips. */
export function dateTimeText(ms: number): string {
  return new Date(ms).toLocaleString(timeLocale())
}

const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0)

/** "Today", "Yesterday", or a short date like "Mon, Oct 20", for separating a chat into days. */
export function dayText(ms: number, now = Date.now()): string {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(ms)) / DAY)
  if (daysAgo === 0) return getT().time.today
  if (daysAgo === 1) return getT().time.yesterdayHeading
  return new Date(ms).toLocaleDateString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric' })
}

/** True when two times fall on different calendar days. */
export const differentDays = (a: number, b: number) => startOfDay(a) !== startOfDay(b)

/** Today plus `days`, as 'YYYY-MM-DD' in the viewer's timezone, for date inputs. */
export function isoDate(days = 0, now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "$1,250" in English, "1.250 €" in Romanian, "1 250 ₽" in Russian. */
export const formatMoney = (cents: number, currency: Currency) => moneyIn(cents, currency, getLanguage())

/** "+$3,200" or "−$500": a change to a price. */
export const formatChange = (cents: number, currency: Currency) => changeIn(cents, currency, getLanguage())

/** What goes in front of an amount box: "$", "€", "₽", "MDL" or "RON". */
export const currencySign = (currency: Currency) => signIn(currency, getLanguage())

/** An amount typed in a money box, in cents: "1,250.50" in English, "1.250,50" in Romanian and Russian. */
export const parseMoney = (input: string) => parseIn(input, getLanguage())

/** Cents for a money box to start with: "1250.50" in English, "1250,50" in Romanian and Russian. */
export const moneyInputValue = (cents: number) => inputValueIn(cents, getLanguage())

/** "US dollar (USD)", "Leu moldovenesc (MDL)", "Российский рубль (RUB)". */
export function currencyName(currency: Currency): string {
  const name = new Intl.DisplayNames([getLocale()], { type: 'currency' }).of(currency) ?? currency
  return `${name[0].toLocaleUpperCase(getLocale())}${name.slice(1)} (${currency})`
}

/** A star rating with one decimal: "4.5", or "4,5" in Romanian and Russian. */
export const ratingText = (rating: number) =>
  rating.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const tradeLabel = (trade: Trade) => getT().trades[trade] ?? trade
export const timingLabel = (timing: JobTiming) => getT().timings[timing] ?? timing

/** "$18,000 – $25,000", "Up to $12,000", "From $5,000", or "No budget given". */
export function budgetText(min: number | null, max: number | null, currency: Currency): string {
  const t = getT().budget
  const money = (cents: number) => formatMoney(cents, currency)
  if (min !== null && max !== null) return min === max ? money(min) : `${money(min)} – ${money(max)}`
  if (max !== null) return t.upTo(money(max))
  if (min !== null) return t.from(money(min))
  return t.none
}

/** "1 week", "6 weeks" */
export const weeksText = (weeks: number) => getT().counts.weeks(weeks)

/** "+3 days", "−2 days", "1 day" */
export function daysChangeText(days: number): string {
  const sign = days > 0 ? '+' : days < 0 ? '−' : ''
  return `${sign}${getT().counts.days(Math.abs(days))}`
}

/** The colour a status pill is shown in. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand'

export interface StatusLook {
  label: string
  tone: Tone
}

const JOB_TONES: Record<JobStatus, Tone> = { open: 'info', hired: 'success', closed: 'neutral' }
const QUOTE_TONES: Record<QuoteStatus, Tone> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'neutral',
  withdrawn: 'neutral',
}
const PROJECT_TONES: Record<ProjectStatus, Tone> = {
  proposed: 'brand',
  active: 'info',
  completed: 'success',
  declined: 'neutral',
}
const STAGE_TONES: Record<StageStatus, Tone> = { todo: 'neutral', in_progress: 'info', done: 'success' }
const CHANGE_TONES: Record<ChangeOrderStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  declined: 'neutral',
  withdrawn: 'neutral',
}

/** Every stage status, in order, for choosing one. */
export const STAGE_STATUSES = Object.keys(STAGE_TONES) as StageStatus[]

export const jobStatus = (status: JobStatus): StatusLook => ({ label: getT().status.job[status], tone: JOB_TONES[status] })
export const quoteStatus = (status: QuoteStatus): StatusLook => ({
  label: getT().status.quote[status],
  tone: QUOTE_TONES[status],
})
export const projectStatus = (status: ProjectStatus): StatusLook => ({
  label: getT().status.project[status],
  tone: PROJECT_TONES[status],
})
export const stageStatus = (status: StageStatus): StatusLook => ({
  label: getT().status.stage[status],
  tone: STAGE_TONES[status],
})
export const changeStatus = (status: ChangeOrderStatus): StatusLook => ({
  label: getT().status.change[status],
  tone: CHANGE_TONES[status],
})

export function invoiceStatus(invoice: Pick<Invoice, 'status' | 'overdue'>): StatusLook {
  const t = getT().status.invoice
  if (invoice.status === 'paid') return { label: t.paid, tone: 'success' }
  if (invoice.status === 'void') return { label: t.void, tone: 'neutral' }
  return invoice.overdue ? { label: t.overdue, tone: 'danger' } : { label: t.due, tone: 'warning' }
}

/** "MR" for "Marcus Reid", for avatars. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}
