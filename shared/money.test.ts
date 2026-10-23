import { describe, expect, it } from 'vitest'
import { LANGUAGE_KEYS } from './languages.ts'
import { CURRENCIES, currencySign, formatChange, formatMoney, isCurrency, moneyInputValue, parseMoney } from './money.ts'

describe('formatMoney', () => {
  it('leaves out cents for whole amounts', () => {
    expect(formatMoney(0, 'USD')).toBe('$0')
    expect(formatMoney(125_000, 'USD')).toBe('$1,250')
    expect(formatMoney(14_850_000, 'USD')).toBe('$148,500')
  })

  it('shows cents when there are some', () => {
    expect(formatMoney(125_050, 'USD')).toBe('$1,250.50')
    expect(formatMoney(5, 'USD')).toBe('$0.05')
  })

  // Intl puts no-break spaces in amounts.
  const plain = (text: string) => text.replace(/\s/g, ' ')

  it('writes each currency with its sign, and both kinds of lei by code', () => {
    expect(CURRENCIES.map((c) => plain(formatMoney(125_000, c)))).toEqual([
      '$1,250',
      '€1,250',
      'MDL 1,250',
      'RON 1,250',
      '₽1,250',
    ])
  })

  it('writes amounts the way each language does', () => {
    expect(plain(formatMoney(125_050, 'EUR', 'ro'))).toBe('1.250,50 €')
    expect(plain(formatMoney(14_850_000, 'MDL', 'ro'))).toBe('148.500 MDL')
    expect(plain(formatMoney(14_850_000, 'RUB', 'ru'))).toBe('148 500 ₽')
  })
})

describe('formatChange', () => {
  it('shows the direction of a price change', () => {
    expect(formatChange(320_000, 'USD')).toBe('+$3,200')
    expect(formatChange(-50_000, 'USD')).toBe('−$500')
    expect(formatChange(0, 'USD')).toBe('$0')
    expect(formatChange(-50_000, 'RON', 'ro').replace(/\s/g, ' ')).toBe('−500 RON')
  })
})

describe('currencySign', () => {
  it('is what goes in front of an amount box', () => {
    expect(CURRENCIES.map((c) => currencySign(c))).toEqual(['$', '€', 'MDL', 'RON', '₽'])
  })
})

describe('isCurrency', () => {
  it('knows the currencies we take', () => {
    expect(isCurrency('MDL')).toBe(true)
    expect(isCurrency('GBP')).toBe(false)
    expect(isCurrency(undefined)).toBe(false)
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
    ['€15', 1500],
    ['₽ 2 500', 250_000],
    ['12,345,678.90', 1_234_567_890],
  ])('reads %j', (input, cents) => {
    expect(parseMoney(input)).toBe(cents)
  })

  // Romanian and Russian put a comma before the cents and may group thousands with a dot.
  it.each([
    ['1250', 125_000],
    ['1250,50', 125_050],
    ['1.250,50', 125_050],
    ['1 250,5', 125_050],
    ['1,25', 125],
    ['1.250', 125_000],
    ['12.345', 1_234_500],
    ['-500', -50_000],
  ])('reads %j in Romanian and Russian', (input, cents) => {
    expect(parseMoney(input, 'ro')).toBe(cents)
    expect(parseMoney(input, 'ru')).toBe(cents)
  })

  it.each([
    '',
    'abc',
    '1,2345',
    '12,34,567',
    '1.2.3',
    '--5',
    '5-',
    '1e5',
    '.5',
    '99999999999999999999',
    // A comma before the cents, or three digits after the dot, isn't how English writes an amount.
    '1250,50',
    '1.250,50',
    '1,25',
    '1.250',
    '0.500',
  ])('refuses %j', (input) => {
    expect(parseMoney(input)).toBeNull()
  })

  it.each(['1250.50', '1,250.50', '1.2345', ',5'])('refuses %j in Romanian and Russian', (input) => {
    expect(parseMoney(input, 'ro')).toBeNull()
    expect(parseMoney(input, 'ru')).toBeNull()
  })
})

describe('moneyInputValue', () => {
  it('writes cents back as a plain number', () => {
    expect(moneyInputValue(120_000)).toBe('1200')
    expect(moneyInputValue(125_050)).toBe('1250.50')
    expect(moneyInputValue(125_005)).toBe('1250.05')
    expect(moneyInputValue(-50_000)).toBe('-500')
    expect(moneyInputValue(0)).toBe('0')
  })

  it('puts a comma before the cents in Romanian and Russian', () => {
    expect(moneyInputValue(125_050, 'ro')).toBe('1250,50')
    expect(moneyInputValue(120_000, 'ru')).toBe('1200')
  })

  it('round-trips through parseMoney in each language', () => {
    for (const language of LANGUAGE_KEYS) {
      for (const cents of [0, 1, 99, 100, 123_456, -7_501]) {
        expect(parseMoney(moneyInputValue(cents, language), language)).toBe(cents)
      }
    }
  })
})
