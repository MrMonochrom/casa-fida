import { useCallback, useEffect, useState } from 'react'
import App from './App'
import { api, setUnauthorizedHandler } from './api'
import { Logo } from './components/Logo'
import { useT } from './i18n'
import { navigate, usePath, useSearchParams } from './router'
import { AuthScreen } from './screens/AuthScreen'
import { BuilderSetup } from './screens/BuilderSetup'
import { InviteScreen } from './screens/InviteScreen'
import { VerifyEmailScreen } from './screens/VerifyEmailScreen'
import type { User } from './types'

/**
 * Shows the right screen: the invite page from a proposal email, the page that confirms an email
 * address, log in / sign up, a new builder's business profile, or the app.
 */
export function Root() {
  // Watching the language here means switching it re-renders everything below.
  const t = useT()
  const path = usePath()
  const params = useSearchParams()
  // undefined while we check for an existing session.
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    // If the session ends on the server (expired, or password changed elsewhere), go back to login.
    setUnauthorizedHandler(() => setUser(null))
    api.me().then(setUser, () => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    setUser(null)
  }, [])

  const showClaimed = useCallback((projectId: number) => navigate(`/projects/${projectId}`, { replace: true }), [])

  if (user === undefined) {
    return (
      <div className="splash" aria-label={t.nav.loading}>
        <Logo />
      </div>
    )
  }

  if (path === '/verify-email') {
    return (
      <VerifyEmailScreen
        token={params.get('token') ?? ''}
        user={user}
        onUserChange={setUser}
        onLeave={() => navigate('/', { replace: true })}
      />
    )
  }

  if (path === '/invite') {
    return (
      <InviteScreen
        token={params.get('token') ?? ''}
        user={user}
        onAuthenticated={setUser}
        onClaimed={showClaimed}
        onLeave={() => navigate('/', { replace: true })}
        onLogout={logout}
      />
    )
  }
  // Logged out on any page: after logging in, the same page opens (like a project from an email).
  if (!user) return <AuthScreen onAuthenticated={setUser} />
  if (user.role === 'builder' && !user.builderProfile) {
    return <BuilderSetup user={user} onDone={setUser} onLogout={logout} />
  }
  return <App user={user} onUserChange={setUser} onLogout={logout} />
}
