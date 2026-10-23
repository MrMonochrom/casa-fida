import type { Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Limiter, resetRateLimits, tooManyAttempts } from './rateLimit.ts'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 22, 12, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('Limiter', () => {
  it('allows attempts up to the limit, then says how long to wait', () => {
    const limiter = new Limiter(3, 60_000)
    for (let i = 0; i < 3; i++) {
      expect(limiter.retryAfter('ip')).toBe(0)
      limiter.hit('ip')
    }
    expect(limiter.retryAfter('ip')).toBe(60)
  })

  it('counts each key separately', () => {
    const limiter = new Limiter(1, 60_000)
    limiter.hit('a')
    expect(limiter.retryAfter('a')).toBeGreaterThan(0)
    expect(limiter.retryAfter('b')).toBe(0)
  })

  it('starts again once the window has passed', () => {
    const limiter = new Limiter(2, 60_000)
    limiter.hit('ip')
    limiter.hit('ip')
    vi.advanceTimersByTime(30_000)
    expect(limiter.retryAfter('ip')).toBe(30)
    vi.advanceTimersByTime(30_000)
    expect(limiter.retryAfter('ip')).toBe(0)
    limiter.hit('ip')
    expect(limiter.retryAfter('ip')).toBe(0)
  })

  it('forgets a key when told to', () => {
    const limiter = new Limiter(1, 60_000)
    limiter.hit('email')
    limiter.reset('email')
    expect(limiter.retryAfter('email')).toBe(0)
  })

  it('forgets everything with resetRateLimits', () => {
    const limiter = new Limiter(1, 60_000)
    limiter.hit('ip')
    resetRateLimits()
    expect(limiter.retryAfter('ip')).toBe(0)
  })

  it('never limits when RATE_LIMITS=off', () => {
    const limiter = new Limiter(1, 60_000)
    limiter.hit('ip')
    limiter.hit('ip')
    vi.stubEnv('RATE_LIMITS', 'off')
    expect(limiter.retryAfter('ip')).toBe(0)
  })

  it('drops finished windows once it tracks many keys', () => {
    const limiter = new Limiter(1, 1_000)
    for (let i = 0; i < 10_000; i++) limiter.hit(`old-${i}`)
    vi.advanceTimersByTime(2_000)
    limiter.hit('new')
    // Old keys are gone, so they're allowed again, and the new key is still counted.
    expect(limiter.retryAfter('old-1')).toBe(0)
    expect(limiter.retryAfter('new')).toBeGreaterThan(0)
  })
})

describe('tooManyAttempts', () => {
  function fakeResponse(cookie?: string) {
    const res = { req: { headers: { cookie } }, set: vi.fn(), status: vi.fn(), json: vi.fn() }
    res.status.mockReturnValue(res)
    return res
  }

  it.each([
    [30, 'Too many attempts. Please try again in 1 minute.'],
    [60, 'Too many attempts. Please try again in 1 minute.'],
    [61, 'Too many attempts. Please try again in 2 minutes.'],
    [900, 'Too many attempts. Please try again in 15 minutes.'],
  ])('answers 429 after %i seconds with a readable wait', (seconds, message) => {
    const res = fakeResponse()
    tooManyAttempts(res as unknown as Response, seconds)
    expect(res.set).toHaveBeenCalledWith('Retry-After', String(seconds))
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith({ error: message })
  })

  it.each([
    ['ro', 60, 'Prea multe încercări. Încercați din nou peste 1 minut.'],
    ['ro', 900, 'Prea multe încercări. Încercați din nou peste 15 minute.'],
    ['ro', 1800, 'Prea multe încercări. Încercați din nou peste 30 de minute.'],
    ['ru', 60, 'Слишком много попыток. Попробуйте снова через 1 минуту.'],
    ['ru', 180, 'Слишком много попыток. Попробуйте снова через 3 минуты.'],
    ['ru', 900, 'Слишком много попыток. Попробуйте снова через 15 минут.'],
  ])('answers in the app language (%s, %i seconds)', (language, seconds, message) => {
    const res = fakeResponse(`cf_lang=${language}`)
    tooManyAttempts(res as unknown as Response, seconds)
    expect(res.json).toHaveBeenCalledWith({ error: message })
  })
})
