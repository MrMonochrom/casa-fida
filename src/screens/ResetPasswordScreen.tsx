import { useState } from 'react'
import type { FormEvent } from 'react'
import { PASSWORD_MIN } from '../../shared/rules'
import { ApiError, api } from '../api'
import { LanguagePicker } from '../components/LanguagePicker'
import { Logo } from '../components/Logo'
import { FormError, TextField } from '../components/ui'
import { useT } from '../i18n'
import type { User } from '../types'

interface Props {
  token: string
  /** The new password is set and the person is logged in. */
  onAuthenticated: (user: User) => void
  onLeave: () => void
}

/** The page the password reset email links to: choosing a new password. */
export function ResetPasswordScreen({ token, onAuthenticated, onLeave }: Props) {
  const t = useT()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The link itself doesn't work (expired or used): asking for a new one is the way on.
  const [linkGone, setLinkGone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onAuthenticated(await api.resetPassword(token, password))
    } catch (err) {
      setError((err as Error).message)
      // A password the server refuses can be fixed here; a link it doesn't know (404) can't.
      setLinkGone(err instanceof ApiError && err.status === 404)
      setBusy(false)
    }
  }

  return (
    <div className="invite">
      <header className="invite__header">
        <Logo />
        <LanguagePicker />
      </header>
      <main className="invite__main">
        {linkGone ? (
          <div className="invite-card">
            <h1 className="invite-card__title">{t.invite.broken}</h1>
            <p>{error}</p>
            <button type="button" className="button button--primary" onClick={onLeave}>
              {t.reset.askAgain}
            </button>
          </div>
        ) : (
          <form className="invite-card form" onSubmit={handleSubmit} noValidate>
            <h1 className="invite-card__title">{t.reset.title}</h1>
            <p className="muted">{t.reset.text}</p>
            <TextField
              label={t.account.newPassword}
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              hint={t.auth.passwordHint(PASSWORD_MIN)}
              required
            />
            <FormError error={error} />
            <div className="form-actions form-actions--start">
              <button type="submit" className="button button--primary" disabled={busy || !password}>
                {busy ? t.common.saving : t.reset.save}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
