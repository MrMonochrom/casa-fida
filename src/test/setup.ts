import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { setLanguage } from '../i18n'
import { FakeEventSource } from './fakeEventSource'

afterEach(() => {
  cleanup()
  setLanguage('en')
  localStorage.removeItem('cf_currency')
  FakeEventSource.instances = []
  window.history.replaceState(null, '', '/')
})

// Live updates: tests send events with FakeEventSource.open.emit(...).
globalThis.EventSource = FakeEventSource as unknown as typeof EventSource

// jsdom doesn't implement these browser features, which the app uses.
Element.prototype.scrollIntoView = function () {}
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
URL.createObjectURL = vi.fn(() => 'blob:preview')
URL.revokeObjectURL = vi.fn()
