// Turning what the API sends into words and dates people read.
import { formatMoney } from '../shared/money'
import { JOB_TIMINGS, TRADES } from '../shared/rules'
import type { JobTiming, Trade } from '../shared/rules'
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

/** "Oct 23, 2026" */
export function dateText(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A 'YYYY-MM-DD' date as "Oct 23, 2026", without the timezone shifting it a day. */
export function dayDateText(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", then a date. */
export function ago(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms)
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const days = Math.floor(diff / DAY)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return dateText(ms)
}

/** "14:05" or "2:05 PM", in the viewer's own format. */
export function timeText(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0)

/** "Today", "Yesterday", or a short date like "Mon, Oct 20", for separating a chat into days. */
export function dayText(ms: number, now = Date.now()): string {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(ms)) / DAY)
  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** True when two times fall on different calendar days. */
export const differentDays = (a: number, b: number) => startOfDay(a) !== startOfDay(b)

/** Today plus `days`, as 'YYYY-MM-DD' in the viewer's timezone, for date inputs. */
export function isoDate(days = 0, now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const tradeLabel = (trade: Trade) => TRADES[trade] ?? trade
export const timingLabel = (timing: JobTiming) => JOB_TIMINGS[timing] ?? timing

/** "$18,000 – $25,000", "Up to $12,000", "From $5,000", or "No budget given". */
export function budgetText(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`
  if (max !== null) return `Up to ${formatMoney(max)}`
  if (min !== null) return `From ${formatMoney(min)}`
  return 'No budget given'
}

/** "1 week", "6 weeks" */
export const weeksText = (weeks: number) => `${weeks} week${weeks === 1 ? '' : 's'}`

/** "+3 days", "−2 days", "1 day" */
export function daysChangeText(days: number): string {
  const abs = Math.abs(days)
  const sign = days > 0 ? '+' : days < 0 ? '−' : ''
  return `${sign}${abs} day${abs === 1 ? '' : 's'}`
}

/** "3 quotes" */
export const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`

/** The colour a status pill is shown in. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand'

export interface StatusLook {
  label: string
  tone: Tone
}

export const JOB_STATUS: Record<JobStatus, StatusLook> = {
  open: { label: 'Taking quotes', tone: 'info' },
  hired: { label: 'Builder hired', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
}

export const QUOTE_STATUS: Record<QuoteStatus, StatusLook> = {
  pending: { label: 'Waiting for an answer', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}

export const PROJECT_STATUS: Record<ProjectStatus, StatusLook> = {
  proposed: { label: 'Proposal', tone: 'brand' },
  active: { label: 'In progress', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
}

export const STAGE_STATUS: Record<StageStatus, StatusLook> = {
  todo: { label: 'To do', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'info' },
  done: { label: 'Done', tone: 'success' },
}

export const CHANGE_STATUS: Record<ChangeOrderStatus, StatusLook> = {
  pending: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}

export function invoiceStatus(invoice: Pick<Invoice, 'status' | 'overdue'>): StatusLook {
  if (invoice.status === 'paid') return { label: 'Paid', tone: 'success' }
  if (invoice.status === 'void') return { label: 'Void', tone: 'neutral' }
  return invoice.overdue ? { label: 'Overdue', tone: 'danger' } : { label: 'Due', tone: 'warning' }
}

/** "MR" for "Marcus Reid", for avatars. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}
