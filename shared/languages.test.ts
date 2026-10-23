import { describe, expect, it } from 'vitest'
import { acceptedLanguages, pickLanguage, pluralEn, pluralRo, pluralRu } from './languages.ts'

describe('pickLanguage', () => {
  it('takes the first language we speak', () => {
    expect(pickLanguage(['ro-MD', 'en'])).toBe('ro')
    expect(pickLanguage(['de-DE', 'ru-RU', 'en'])).toBe('ru')
    expect(pickLanguage(['en-GB'])).toBe('en')
    expect(pickLanguage(['mo'])).toBe('ro')
  })

  it('falls back to English', () => {
    expect(pickLanguage([])).toBe('en')
    expect(pickLanguage(['fr', 'de'])).toBe('en')
  })
})

describe('acceptedLanguages', () => {
  it('orders an Accept-Language header by preference', () => {
    expect(acceptedLanguages('fr;q=0.5, ru-RU, en;q=0.8')).toEqual(['ru-RU', 'en', 'fr'])
    expect(acceptedLanguages('ro, *;q=0.1, de;q=0')).toEqual(['ro'])
    expect(acceptedLanguages(undefined)).toEqual([])
  })
})

describe('plurals', () => {
  it('picks the word form for a number in each language', () => {
    expect([1, 2, 0].map((n) => pluralEn(n, 'day', 'days'))).toEqual(['day', 'days', 'days'])
    expect([1, 2, 19, 20, 101, 120].map((n) => pluralRo(n, 'zi', 'zile', 'de zile'))).toEqual([
      'zi',
      'zile',
      'zile',
      'de zile',
      'zile',
      'de zile',
    ])
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => pluralRu(n, 'день', 'дня', 'дней'))).toEqual([
      'день',
      'дня',
      'дней',
      'дней',
      'день',
      'дня',
      'дней',
    ])
  })
})
