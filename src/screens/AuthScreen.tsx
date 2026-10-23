import { useState } from 'react'
import type { FormEvent } from 'react'
import { PASSWORD_MIN } from '../../shared/rules'
import type { Role } from '../../shared/rules'
import { api } from '../api'
import { Logo } from '../components/Logo'
import { FormError, TextField } from '../components/ui'
import type { InvitePreview, User } from '../types'

interface Props {
  onAuthenticated: (user: User) => void
  /** From an invite link: the builder's proposal, and the name and email they used for the client. */
  invite?: InvitePreview
}

const ROLE_CHOICES: { role: Role; title: string; text: string }[] = [
  { role: 'client', title: 'I need work done', text: 'Post jobs, compare quotes and follow your project.' },
  { role: 'builder', title: "I'm a builder", text: 'Find work, send proposals and keep clients updated.' },
]

/** Log in or sign up. Without an invite, it also says what Casa Fida is. */
export function AuthScreen({ onAuthenticated, invite }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>(invite ? 'signup' : 'login')
  const [role, setRole] = useState<Role | null>(invite ? 'client' : null)
  const [name, setName] = useState(invite?.clientName ?? '')
  const [email, setEmail] = useState(invite?.clientEmail ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function switchMode(next: 'login' | 'signup') {
    setMode(next)
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'signup' && !role) {
      setError('Choose whether you need work done or are a builder.')
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

  const form = (
    <form className="auth-card" onSubmit={handleSubmit} noValidate>
      <h2 className="auth-card__title">{mode === 'login' ? 'Log in' : 'Create your free account'}</h2>

      {mode === 'signup' && !invite && (
        <fieldset className="role-choice">
          <legend className="field__label">How will you use Casa Fida?</legend>
          {ROLE_CHOICES.map((choice) => (
            <label key={choice.role} className={`role-option ${role === choice.role ? 'role-option--on' : ''}`}>
              <input
                type="radio"
                name="role"
                value={choice.role}
                checked={role === choice.role}
                onChange={() => setRole(choice.role)}
                className="visually-hidden"
              />
              <strong>{choice.title}</strong>
              <span>{choice.text}</span>
            </label>
          ))}
        </fieldset>
      )}

      {mode === 'signup' && (
        <TextField label="Your name" value={name} onChange={setName} autoComplete="name" required />
      )}
      <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        hint={mode === 'signup' ? `At least ${PASSWORD_MIN} characters.` : undefined}
        required
      />

      <FormError error={error} />
      <button type="submit" className="button button--primary button--block" disabled={busy}>
        {busy ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>

      <p className="auth-card__switch">
        {mode === 'login' ? (
          <>
            New to Casa Fida?{' '}
            <button type="button" className="text-button" onClick={() => switchMode('signup')}>
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button type="button" className="text-button" onClick={() => switchMode('login')}>
              Log in
            </button>
          </>
        )}
      </p>
    </form>
  )

  if (invite) return form

  return (
    <div className="auth">
      <section className="auth__intro">
        <Logo />
        <h1 className="auth__headline">Builders and their clients, on the same page.</h1>
        <ul className="auth__points">
          <li>
            <strong>Find the right builder.</strong> Post a job, compare quotes and read reviews from past clients.
          </li>
          <li>
            <strong>Follow the work.</strong> See each stage of the project and photo updates as they happen.
          </li>
          <li>
            <strong>No surprises on price.</strong> Approve changes before they happen and see every invoice in one
            place.
          </li>
          <li>
            <strong>Talk directly.</strong> Message each other without losing anything in a text thread.
          </li>
        </ul>
        {import.meta.env.DEV && (
          <p className="auth__demo">
            Trying it locally? Log in as <code>emma.clarke@example.com</code> (client) or{' '}
            <code>marcus.reid@example.com</code> (builder), password <code>CasaFida123</code>.
          </p>
        )}
      </section>
      <section className="auth__form">{form}</section>
    </div>
  )
}
