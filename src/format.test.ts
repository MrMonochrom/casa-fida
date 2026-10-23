import { describe, expect, it } from 'vitest'
import {
  ago,
  budgetText,
  dayDateText,
  dayText,
  daysChangeText,
  initials,
  invoiceStatus,
  isoDate,
  plural,
  weeksText,
} from './format'

const NOW = new Date(2026, 9, 23, 12, 0).getTime()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('ago', () => {
  it('says how long ago something happened, in words', () => {
    expect(ago(NOW - 10_000, NOW)).toBe('just now')
    expect(ago(NOW - MINUTE, NOW)).toBe('1 minute ago')
    expect(ago(NOW - 5 * MINUTE, NOW)).toBe('5 minutes ago')
    expect(ago(NOW - HOUR, NOW)).toBe('1 hour ago')
    expect(ago(NOW - 3 * HOUR, NOW)).toBe('3 hours ago')
    expect(ago(NOW - DAY, NOW)).toBe('yesterday')
    expect(ago(NOW - 4 * DAY, NOW)).toBe('4 days ago')
  })

  it('gives a date for anything a month or more ago', () => {
    expect(ago(new Date(2026, 4, 1).getTime(), NOW)).toBe('May 1, 2026')
  })

  it('treats times in the future (a clock slightly ahead) as just now', () => {
    expect(ago(NOW + 5000, NOW)).toBe('just now')
  })
})

describe('dates', () => {
  it('shows a date-only value on its own day, whatever the timezone', () => {
    expect(dayDateText('2026-11-01')).toBe('Nov 1, 2026')
  })

  it('names today and yesterday for chat separators', () => {
    expect(dayText(NOW - HOUR, NOW)).toBe('Today')
    expect(dayText(NOW - DAY, NOW)).toBe('Yesterday')
    expect(dayText(new Date(2026, 9, 19, 9).getTime(), NOW)).toBe('Mon, Oct 19')
  })

  it('makes dates for date inputs, counting from today', () => {
    const today = new Date(2026, 9, 23)
    expect(isoDate(0, today)).toBe('2026-10-23')
    expect(isoDate(14, today)).toBe('2026-11-06')
    expect(isoDate(-23, today)).toBe('2026-09-30')
  })
})

describe('budgetText', () => {
  it('shows whichever ends of the budget were given', () => {
    expect(budgetText(1_800_000, 2_500_000)).toBe('$18,000 – $25,000')
    expect(budgetText(1_800_000, 1_800_000)).toBe('$18,000')
    expect(budgetText(null, 1_200_000)).toBe('Up to $12,000')
    expect(budgetText(500_000, null)).toBe('From $5,000')
    expect(budgetText(null, null)).toBe('No budget given')
  })
})

describe('small words', () => {
  it('counts things', () => {
    expect(plural(1, 'quote')).toBe('1 quote')
    expect(plural(3, 'quote')).toBe('3 quotes')
    expect(plural(0, 'quote')).toBe('0 quotes')
    expect(weeksText(1)).toBe('1 week')
    expect(weeksText(6)).toBe('6 weeks')
  })

  it('signs schedule changes', () => {
    expect(daysChangeText(3)).toBe('+3 days')
    expect(daysChangeText(1)).toBe('+1 day')
    expect(daysChangeText(-2)).toBe('−2 days')
    expect(daysChangeText(0)).toBe('0 days')
  })

  it('makes initials for avatars', () => {
    expect(initials('Marcus Reid')).toBe('MR')
    expect(initials('Reid & Sons Construction')).toBe('RC')
    expect(initials('cher')).toBe('C')
    expect(initials('  ')).toBe('?')
  })
})

describe('invoiceStatus', () => {
  it('flags overdue invoices', () => {
    expect(invoiceStatus({ status: 'due', overdue: false })).toEqual({ label: 'Due', tone: 'warning' })
    expect(invoiceStatus({ status: 'due', overdue: true })).toEqual({ label: 'Overdue', tone: 'danger' })
    expect(invoiceStatus({ status: 'paid', overdue: false })).toEqual({ label: 'Paid', tone: 'success' })
    expect(invoiceStatus({ status: 'void', overdue: false })).toEqual({ label: 'Void', tone: 'neutral' })
  })
})
