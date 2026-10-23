import { useState } from 'react'
import type { FormEvent } from 'react'
import { PLAN_LIMITS, TRIAL_DAYS } from '../../shared/plans'
import { NAME_MAX, PASSWORD_MIN } from '../../shared/rules'
import { api } from '../api'
import { BuilderProfileForm } from '../components/BuilderProfileForm'
import { FormError, PageHeader, TextField } from '../components/ui'
import { dateText } from '../format'
import { Link } from '../components/Link'
import { useT } from '../i18n'
import { useSession } from '../session'
import type { EmailSettings } from '../types'

/**
 * Your details, your plan and business profile (builders), your password, which emails you get,
 * and logging out.
 */
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
            <h2 className="section__title">{t.plan.title}</h2>
            <PlanCard />
          </section>
        )}
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
        <section className="section">
          <h2 className="section__title">{t.emails.title}</h2>
          <EmailSettingsForm />
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

/** A builder's plan: what Free and Pro each give, and the one free trial of Pro. */
function PlanCard() {
  const t = useT()
  const { user, onUserChange } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const plan = user.plan ?? { name: 'free', endsAt: null, trialAvailable: true }
  const pro = plan.name === 'pro'
  const rows = [
    { label: t.plan.jobAlerts, free: t.plan.daily, pro: t.plan.instant },
    {
      label: t.plan.quotesPerDay,
      free: String(PLAN_LIMITS.free.newQuotesPerDay),
      pro: String(PLAN_LIMITS.pro.newQuotesPerDay),
    },
    { label: t.plan.trades, free: String(PLAN_LIMITS.free.trades), pro: String(PLAN_LIMITS.pro.trades) },
  ]
  const offerTrial = !pro && plan.trialAvailable

  async function startTrial() {
    setBusy(true)
    setError(null)
    try {
      onUserChange(await api.startTrial())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card plan">
      <p className="plan__status">
        <span className={`pill ${pro ? 'pill--brand' : 'pill--neutral'}`}>{pro ? t.plan.pro : t.plan.free}</span>
        <span>{pro ? (plan.endsAt ? t.plan.proUntil(dateText(plan.endsAt)) : t.plan.proNoEnd) : t.plan.onFree}</span>
      </p>
      <table className="plan__table">
        <thead>
          <tr>
            <td />
            <th scope="col" className={pro ? '' : 'plan__current'}>
              {t.plan.free}
            </th>
            <th scope="col" className={pro ? 'plan__current' : ''}>
              {t.plan.pro}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td className={pro ? '' : 'plan__current'}>{row.free}</td>
              <td className={pro ? 'plan__current' : ''}>{row.pro}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {offerTrial && (
        <div className="plan__trial">
          <button type="button" className="button button--primary" onClick={startTrial} disabled={busy}>
            {busy ? t.common.oneMoment : t.plan.startTrial(TRIAL_DAYS)}
          </button>
          <p className="muted small">{t.plan.trialNote}</p>
        </div>
      )}
      <FormError error={error} />
      <p className="muted small">{t.plan.paidSoon}</p>
    </div>
  )
}

function EmailSettingsForm() {
  const t = useT()
  const { user, onUserChange } = useSession()
  // A page opened before email settings existed has none for the account yet: they start all on.
  const [settings, setSettings] = useState<EmailSettings>({
    quotes: true,
    projects: true,
    messages: true,
    jobs: true,
    ...(user.notifications as Partial<EmailSettings> | undefined),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const builder = user.role === 'builder'
  const choices: { key: keyof EmailSettings; label: string }[] = [
    { key: 'quotes', label: builder ? t.emails.quotesBuilder : t.emails.quotesClient },
    { key: 'projects', label: builder ? t.emails.projectsBuilder : t.emails.projectsClient },
    { key: 'messages', label: t.emails.messages },
    ...(builder
      ? [{ key: 'jobs' as const, label: user.plan?.name === 'pro' ? t.emails.jobsInstant : t.emails.jobsDaily }]
      : []),
  ]

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      onUserChange(await api.saveEmailSettings(settings))
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <p className="muted">{t.emails.hint}</p>
      {choices.map(({ key, label }) => (
        <label key={key} className="checkbox">
          <input
            type="checkbox"
            checked={settings[key]}
            onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
          />
          <span>{label}</span>
        </label>
      ))}
      <FormError error={error} />
      {saved && !error && (
        <p className="form-success" role="status">
          {t.common.saved}
        </p>
      )}
      <div className="form-actions form-actions--start">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? t.common.saving : t.common.save}
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
