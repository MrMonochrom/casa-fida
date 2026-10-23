import { createContext, useContext } from 'react'
import type { User } from './types'

export interface Session {
  user: User
  onUserChange: (user: User) => void
  onLogout: () => void
  /** Reloads the counts on the menu, after something that changes them. */
  refreshSummary: () => void
}

export const SessionContext = createContext<Session | null>(null)

/** The logged-in person and app-wide actions, for any screen inside App. */
export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession is only for screens inside App.')
  return session
}
