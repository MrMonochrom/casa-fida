import { describe, expect, it, vi } from 'vitest'
import { isOnline, publish, subscribe } from './events.ts'

describe('live events', () => {
  it('reach everyone listening for that user, and nobody else', () => {
    const first = vi.fn()
    const second = vi.fn()
    const someoneElse = vi.fn()
    const stops = [subscribe(1, first), subscribe(1, second), subscribe(2, someoneElse)]

    publish(1, { type: 'message', conversationId: 7 })

    expect(first).toHaveBeenCalledWith({ type: 'message', conversationId: 7 })
    expect(second).toHaveBeenCalledWith({ type: 'message', conversationId: 7 })
    expect(someoneElse).not.toHaveBeenCalled()
    for (const stop of stops) stop()
  })

  it('stop once unsubscribed', () => {
    const listener = vi.fn()
    const stop = subscribe(3, listener)
    stop()
    publish(3, { type: 'project', projectId: 1 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('show who has the app open', () => {
    expect(isOnline(4)).toBe(false)
    const stopPhone = subscribe(4, vi.fn())
    const stopLaptop = subscribe(4, vi.fn())
    expect(isOnline(4)).toBe(true)
    stopPhone()
    expect(isOnline(4)).toBe(true)
    stopLaptop()
    expect(isOnline(4)).toBe(false)
  })

  it('are fine with nobody listening', () => {
    expect(() => publish(99, { type: 'job', jobId: 1 })).not.toThrow()
  })
})
