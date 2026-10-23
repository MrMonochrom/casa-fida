import { useState } from 'react'
import type { FormEvent } from 'react'
import { NAME_MAX, PASSWORD_MIN } from '../../shared/rules'
import { api } from '../api'
import { BuilderProfileForm } from '../components/BuilderProfileForm'
import { FormError, PageHeader, TextField } from '../components/ui'
import { dateText } from '../format'
import { Link } from '../components/Link'
import { useT } from '../i18n'
import { useSession } from '../session'

/** Your details, your business profile (builders), your password, and logging out. */
export function Account() {
  const t = useT()
  const { user, onUserChange, onLogout } = useSession()
  const since = dateText(user.memberSince)
  return (
    <>
      <PageHeader
        title={t.account.title}
        subtitle={user.role === 'builder' ? t.account.builderSince(since) : t.account.clientSince(since)}
        actions={
          <button type="button" className="button button--secondary" onClick={onLogout}>
            {t.common.logOut}
          </button>
        }
      />
      <div className="account">
        {user.role === 'builder' && (
          <section className="section">
            <div className="section__header">
              <h2 className="section__title">{t.account.businessProfile}</h2>
              <Link to={`/builders/${user.id}`} className="text-link">
                {t.account.seeAsClients}
              </Link>
            </div>
            <div className="card">
              <BuilderProfileForm user={user} onSaved={onUserChange} submitLabel={t.account.saveProfile} />
            </div>
          </section>
        )}
        <section className="section">
          <h2 className="section__title">{t.account.yourDetails}</h2>
          <DetailsForm />
        </section>
        <section className="section">
          <h2 className="section__title">{t.common.password}</h2>
          <PasswordForm />
        </section>
      </div>
    </>
  )
}

function DetailsForm() {
  const t = useT()
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
        <TextField label={t.common.name} value={name} onChange={setName} maxLength={NAME_MAX} autoComplete="name" />
        <TextField
          label={t.common.phone}
          extra={t.common.optional}
          type="tel"
          value={phone}
          onChange={setPhone}
          autoComplete="tel"
          hint={t.account.phoneHint}
        />
      </div>
      <TextField label={t.common.email} value={user.email} onChange={() => {}} readOnly disabled hint={t.account.emailHint} />
      <FormError error={error} />
      {saved && !error && (
        <p className="form-success" role="status">
          {t.common.saved}
        </p>
      )}
      <div className="form-actions form-actions--start">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? t.common.saving : t.account.saveDetails}
        </button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const t = useT()
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
          label={t.account.currentPassword}
          type="password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <TextField
          label={t.account.newPassword}
          type="password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint={t.account.newPasswordHint(PASSWORD_MIN)}
        />
      </div>
      <FormError error={error} />
      {saved && !error && (
        <p className="form-success" role="status">
          {t.account.passwordChanged}
        </p>
      )}
      <div className="form-actions form-actions--start">
        <button type="submit" className="button button--primary" disabled={busy || !current || !next}>
          {busy ? t.common.saving : t.account.changePassword}
        </button>
      </div>
    </form>
  )
}
