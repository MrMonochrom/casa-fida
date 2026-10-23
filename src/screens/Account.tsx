import { useState } from 'react'
import type { FormEvent } from 'react'
import { NAME_MAX, PASSWORD_MIN } from '../../shared/rules'
import { api } from '../api'
import { BuilderProfileForm } from '../components/BuilderProfileForm'
import { FormError, PageHeader, TextField } from '../components/ui'
import { dateText } from '../format'
import { Link } from '../components/Link'
import { useSession } from '../session'

/** Your details, your business profile (builders), your password, and logging out. */
export function Account() {
  const { user, onUserChange, onLogout } = useSession()
  return (
    <>
      <PageHeader
        title="Account"
        subtitle={`${user.role === 'builder' ? 'Builder' : 'Client'} account · member since ${dateText(user.memberSince)}`}
        actions={
          <button type="button" className="button button--secondary" onClick={onLogout}>
            Log out
          </button>
        }
      />
      <div className="account">
        {user.role === 'builder' && (
          <section className="section">
            <div className="section__header">
              <h2 className="section__title">Business profile</h2>
              <Link to={`/builders/${user.id}`} className="text-link">
                See it as clients do
              </Link>
            </div>
            <div className="card">
              <BuilderProfileForm user={user} onSaved={onUserChange} submitLabel="Save profile" />
            </div>
          </section>
        )}
        <section className="section">
          <h2 className="section__title">Your details</h2>
          <DetailsForm />
        </section>
        <section className="section">
          <h2 className="section__title">Password</h2>
          <PasswordForm />
        </section>
      </div>
    </>
  )
}

function DetailsForm() {
  const { user, onUserChange } = useSession()
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      onUserChange(await api.saveAccount(name, phone))
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <div className="form-row">
        <TextField label="Name" value={name} onChange={setName} maxLength={NAME_MAX} autoComplete="name" />
        <TextField
          label="Phone"
          extra="(optional)"
          type="tel"
          value={phone}
          onChange={setPhone}
          autoComplete="tel"
          hint="Only shown to people you have a project with."
        />
      </div>
      <TextField label="Email" value={user.email} onChange={() => {}} readOnly disabled hint="Your email can't be changed." />
      <FormError error={error} />
      {saved && !error && (
        <p className="form-success" role="status">
          Saved.
        </p>
      )}
      <div className="form-actions form-actions--start">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <div className="form-row">
        <TextField
          label="Current password"
          type="password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <TextField
          label="New password"
          type="password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters. Other browsers you're logged in on are logged out.`}
        />
      </div>
      <FormError error={error} />
      {saved && !error && (
        <p className="form-success" role="status">
          Password changed.
        </p>
      )}
      <div className="form-actions form-actions--start">
        <button type="submit" className="button button--primary" disabled={busy || !current || !next}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  )
}
