import { useState } from 'react'
import type { FormEvent } from 'react'
import { PASSWORD_MIN } from '../../shared/rules'
import type { Role } from '../../shared/rules'
import { api } from '../api'
import { LanguagePicker } from '../components/LanguagePicker'
import { Logo } from '../components/Logo'
import { FormError, TextField } from '../components/ui'
import { fill, useT } from '../i18n'
import type { InvitePreview, User } from '../types'

interface Props {
  onAuthenticated: (user: User) => void
  /** From an invite link: the builder's proposal, and the name and email they used for the client. */
  invite?: InvitePreview
}

const ROLES: Role[] = ['client', 'builder']

type Mode = 'login' | 'signup' | 'forgot'

/**
 * Log in, sign up, or ask for a link to choose a new password. Without an invite, it also says
 * what Casa Fida is.
 */
export function AuthScreen({ onAuthenticated, invite }: Props) {
  const t = useT()
  const [mode, setMode] = useState<Mode>(invite ? 'signup' : 'login')
  const [role, setRole] = useState<Role | null>(invite ? 'client' : null)
  const [name, setName] = useState(invite?.clientName ?? '')
  const [email, setEmail] = useState(invite?.clientEmail ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Where the reset link went, once it's been asked for.
  const [sentTo, setSentTo] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setSentTo(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'forgot') {
      setBusy(true)
      setError(null)
      try {
        await api.requestPasswordReset(email)
        setSentTo(email.trim())
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(false)
      }
      return
    }
    if (mode === 'signup' && !role) {
      setError(t.auth.chooseRole)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const user =
        mode === 'login'
          ? await api.login(email, password)
          : await api.signup({ name, email, password, role: role! })
      onAuthenticated(user)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const backToLogin = (
    <p className="auth-card__switch">
      <button type="button" className="text-button" onClick={() => switchMode('login')}>
        {t.auth.backToLogin}
      </button>
    </p>
  )

  const form =
    mode === 'forgot' ? (
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <h2 className="auth-card__title">{t.auth.forgotTitle}</h2>
        {sentTo ? (
          <p role="status">{t.auth.forgotSent(sentTo)}</p>
        ) : (
          <>
            <p className="muted">{t.auth.forgotText}</p>
            <TextField label={t.common.email} type="email" value={email} onChange={setEmail} autoComplete="email" required />
            <FormError error={error} />
            <button type="submit" className="button button--primary button--block" disabled={busy}>
              {busy ? t.common.oneMoment : t.auth.sendLink}
            </button>
          </>
        )}
        {backToLogin}
      </form>
    ) : (
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <h2 className="auth-card__title">{mode === 'login' ? t.auth.logIn : t.auth.createFreeAccount}</h2>

        {mode === 'signup' && !invite && (
          <fieldset className="role-choice">
            <legend className="field__label">{t.auth.howUse}</legend>
            {ROLES.map((choice) => (
              <label key={choice} className={`role-option ${role === choice ? 'role-option--on' : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value={choice}
                  checked={role === choice}
                  onChange={() => setRole(choice)}
                  className="visually-hidden"
                />
                <strong>{t.auth.roles[choice].title}</strong>
                <span>{t.auth.roles[choice].text}</span>
              </label>
            ))}
          </fieldset>
        )}

        {mode === 'signup' && (
          <TextField label={t.auth.yourName} value={name} onChange={setName} autoComplete="name" required />
        )}
        <TextField label={t.common.email} type="email" value={email} onChange={setEmail} autoComplete="email" required />
        <TextField
          label={t.common.password}
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          hint={mode === 'signup' ? t.auth.passwordHint(PASSWORD_MIN) : undefined}
          required
        />
        {mode === 'login' && (
          <p className="auth-card__forgot">
            <button type="button" className="text-button" onClick={() => switchMode('forgot')}>
              {t.auth.forgot}
            </button>
          </p>
        )}

        <FormError error={error} />
        <button type="submit" className="button button--primary button--block" disabled={busy}>
          {busy ? t.common.oneMoment : mode === 'login' ? t.auth.logIn : t.auth.createAccount}
        </button>

        <p className="auth-card__switch">
          {mode === 'login'
            ? fill(t.auth.newHere, {
                link: (
                  <button type="button" className="text-button" onClick={() => switchMode('signup')}>
                    {t.auth.createAnAccount}
                  </button>
                ),
              })
            : fill(t.auth.haveAccount, {
                link: (
                  <button type="button" className="text-button" onClick={() => switchMode('login')}>
                    {t.auth.logIn}
                  </button>
                ),
              })}
        </p>
      </form>
    )

  if (invite) return form

  return (
    <div className="auth">
      <LanguagePicker className="auth__language" />
      <section className="auth__intro">
        <Logo />
        <h1 className="auth__headline">{t.auth.headline}</h1>
        <ul className="auth__points">
          {t.auth.points.map((point) => (
            <li key={point.title}>
              <strong>{point.title}</strong> {point.text}
            </li>
          ))}
        </ul>
        {import.meta.env.DEV && (
          <p className="auth__demo">
            {fill(t.auth.demo, {
              client: <code>emma.clarke@example.com</code>,
              builder: <code>marcus.reid@example.com</code>,
              password: <code>CasaFida123</code>,
            })}
          </p>
        )}
      </section>
      <section className="auth__form">{form}</section>
    </div>
  )
}
