import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { LanguagePicker } from '../components/LanguagePicker'
import { Logo } from '../components/Logo'
import { Loading } from '../components/ui'
import { useT } from '../i18n'
import type { User } from '../types'

interface Props {
  token: string
  /** null when logged out. */
  user: User | null
  onUserChange: (user: User) => void
  onLeave: () => void
}

/** The page the confirmation email links to. Opening it confirms the address, logged in or not. */
export function VerifyEmailScreen({ token, user, onUserChange, onLeave }: Props) {
  const t = useT()
  const [email, setEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A link works once, so it's only sent once, even when React runs this twice in development.
  const sent = useRef(false)
  const loggedIn = user !== null

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    api.verifyEmail(token).then(
      async (confirmed) => {
        setEmail(confirmed)
        // The app shows the logged-in person as unconfirmed until it hears otherwise.
        if (loggedIn) {
          const fresh = await api.me().catch(() => null)
          if (fresh) onUserChange(fresh)
        }
      },
      (err: Error) => setError(err.message),
    )
  }, [token, loggedIn, onUserChange])

  let body
  if (error || email) {
    body = (
      <div className="invite-card">
        <h1 className="invite-card__title">{error ? t.invite.broken : t.verify.done}</h1>
        <p>{error ?? t.verify.doneText(email!)}</p>
        <button type="button" className="button button--primary" onClick={onLeave}>
          {t.invite.goToCasaFida}
        </button>
      </div>
    )
  } else {
    body = <Loading />
  }

  return (
    <div className="invite">
      <header className="invite__header">
        <Logo />
        <LanguagePicker />
      </header>
      <main className="invite__main">{body}</main>
    </div>
  )
}
