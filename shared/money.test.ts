import { describe, expect, it } from 'vitest'
import { formatChange, formatMoney, moneyInputValue, parseMoney } from './money.ts'

describe('formatMoney', () => {
  it('leaves out cents for whole amounts', () => {
    expect(formatMoney(0)).toBe('$0')
    expect(formatMoney(125_000)).toBe('$1,250')
    expect(formatMoney(14_850_000)).toBe('$148,500')
  })

  it('shows cents when there are some', () => {
    expect(formatMoney(125_050)).toBe('$1,250.50')
    expect(formatMoney(5)).toBe('$0.05')
  })
})

describe('formatChange', () => {
  it('shows the direction of a price change', () => {
    expect(formatChange(320_000)).toBe('+$3,200')
    expect(formatChange(-50_000)).toBe('−$500')
    expect(formatChange(0)).toBe('$0')
  })
})

describe('parseMoney', () => {
  it.each([
    ['1250', 125_000],
    ['1,250', 125_000],
    ['$1,250.5', 125_050],
    [' 1250.05 ', 125_005],
    ['0', 0],
    ['-500', -50_000],
    ['−500', -50_000],
    ['-0', 0],
    ['$ 10', 1000],
  ])('reads %j', (input, cents) => {
    expect(parseMoney(input)).toBe(cents)
  })

  it.each(['', 'abc', '12.345', '1.2.3', '--5', '5-', '1e5', '.5', '99999999999999999999'])(
    'refuses %j',
    (input) => {
      expect(parseMoney(input)).toBeNull()
    },
  )
})

describe('moneyInputValue', () => {
  it('writes cents back as a plain number', () => {
    expect(moneyInputValue(120_000)).toBe('1200')
    expect(moneyInputValue(125_050)).toBe('1250.50')
    expect(moneyInputValue(125_005)).toBe('1250.05')
    expect(moneyInputValue(-50_000)).toBe('-500')
    expect(moneyInputValue(0)).toBe('0')
  })

  it('round-trips through parseMoney', () => {
    for (const cents of [0, 1, 99, 100, 123_456, -7_501]) expect(parseMoney(moneyInputValue(cents))).toBe(cents)
  })
})
