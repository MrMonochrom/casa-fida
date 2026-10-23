import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import { SessionContext } from '../session'
import type { Session } from '../session'
import type { User } from '../types'

/** Renders a screen as if `user` were logged in to the app. */
export function renderAs(user: User, ui: ReactElement, overrides: Partial<Session> = {}) {
  const session: Session = {
    user,
    onUserChange: vi.fn(),
    onLogout: vi.fn(),
    refreshSummary: vi.fn(),
    ...overrides,
  }
  return { ...render(<SessionContext.Provider value={session}>{ui}</SessionContext.Provider>), session }
}

/** Opens a page at an address, like following a link. */
export function visit(address: string) {
  window.history.replaceState(null, '', address)
}
