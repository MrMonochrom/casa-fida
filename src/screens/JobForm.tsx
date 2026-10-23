import { useState } from 'react'
import type { FormEvent } from 'react'
import { moneyInputValue, parseMoney } from '../format'
import { DESCRIPTION_MAX, PLACE_MAX, TITLE_MAX, TRADE_KEYS } from '../../shared/rules'
import type { JobTiming, Trade } from '../../shared/rules'
import { api } from '../api'
import { CurrencyField } from '../components/CurrencyField'
import { BackLink, FormError, Loading, MoneyField, PageHeader, SelectField, TextAreaField, TextField } from '../components/ui'
import { useT } from '../i18n'
import { preferredCurrency, rememberCurrency } from '../preferredCurrency'
import { navigate } from '../router'
import type { Job } from '../types'
import { useResource } from '../useResource'

/** Posting a new job (no id) or changing an open one. */
export function JobForm({ id = null }: { id?: number | null }) {
  const { data, error, reload } = useResource(
    () => (id ? api.jobWithQuotes(id).then((r) => r.job) : Promise.resolve(null)),
    String(id),
  )
  if (data === undefined) return <Loading error={error} onRetry={reload} />
  return <JobFormFields job={data} />
}

/** An amount box's text as cents, null when empty, or undefined when it isn't an amount. */
function optionalAmount(value: string): number | null | undefined {
  if (!value.trim()) return null
  const cents = parseMoney(value)
  return cents !== null && cents > 0 ? cents : undefined
}

function JobFormFields({ job }: { job: Job | null }) {
  const t = useT()
  const [title, setTitle] = useState(job?.title ?? '')
  const [trade, setTrade] = useState<Trade | ''>(job?.trade ?? '')
  const [location, setLocation] = useState(job?.location ?? '')
  const [description, setDescription] = useState(job?.description ?? '')
  const [budgetMin, setBudgetMin] = useState(job?.budgetMin ? moneyInputValue(job.budgetMin) : '')
  const [budgetMax, setBudgetMax] = useState(job?.budgetMax ? moneyInputValue(job.budgetMax) : '')
  const [timing, setTiming] = useState<JobTiming>(job?.timing ?? 'flexible')
  const [currency, setCurrency] = useState(job?.currency ?? preferredCurrency)
  // Quotes are in the job's currency, so it stays once any have come in.
  const currencyLocked = !!job && job.quoteCount > 0
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (job && job.status !== 'open') {
    return (
      <>
        <BackLink to={`/jobs/${job.id}`}>{t.jobs.backToJob}</BackLink>
        <p className="notice">{t.jobs.onlyOpenChange}</p>
      </>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const min = optionalAmount(budgetMin)
    const max = optionalAmount(budgetMax)
    if (min === undefined || max === undefined) {
      setError(t.jobs.budgetInvalid)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const input = { title, trade, location, description, currency, budgetMin: min, budgetMax: max, timing }
      const saved = job ? await api.saveJob(job.id, input) : await api.postJob(input)
      rememberCurrency(currency)
      navigate(`/jobs/${saved.id}`, { replace: !!job })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <BackLink to={job ? `/jobs/${job.id}` : '/jobs'}>{job ? t.jobs.backToJob : t.nav.myJobs}</BackLink>
      <PageHeader
        title={job ? t.jobs.changeTitle : t.common.postJob}
        subtitle={job ? t.jobs.changeSubtitle : t.jobs.postSubtitle}
      />
      <form className="card form form--narrow" onSubmit={handleSubmit} noValidate>
        <TextField
          label={t.common.title}
          value={title}
          onChange={setTitle}
          maxLength={TITLE_MAX}
          placeholder={t.jobs.titlePlaceholder}
          required
        />
        <div className="form-row">
          <SelectField label={t.jobs.kindOfWork} value={trade} onChange={(v) => setTrade(v as Trade)} required>
            <option value="" disabled>
              {t.jobs.choose}
            </option>
            {TRADE_KEYS.map((key) => (
              <option key={key} value={key}>
                {t.trades[key]}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t.jobs.where}
            value={location}
            onChange={setLocation}
            maxLength={PLACE_MAX}
            placeholder={t.common.placePlaceholder}
            hint={t.jobs.whereHint}
            required
          />
        </div>
        <TextAreaField
          label={t.jobs.describe}
          value={description}
          onChange={setDescription}
          maxLength={DESCRIPTION_MAX}
          rows={6}
          placeholder={t.jobs.describePlaceholder}
          required
        />
        <CurrencyField
          value={currency}
          onChange={setCurrency}
          disabled={currencyLocked}
          hint={currencyLocked ? t.jobs.currencyLocked : undefined}
        />
        <div className="form-row">
          <MoneyField
            label={t.jobs.budgetFrom}
            extra={t.common.optional}
            value={budgetMin}
            onChange={setBudgetMin}
            currency={currency}
          />
          <MoneyField
            label={t.jobs.budgetUpTo}
            extra={t.common.optional}
            value={budgetMax}
            onChange={setBudgetMax}
            currency={currency}
          />
        </div>
        <SelectField label={t.jobs.whenStart} value={timing} onChange={(v) => setTiming(v as JobTiming)}>
          {Object.entries(t.timings).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={() => window.history.back()}>
            {t.common.cancel}
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? t.common.saving : job ? t.common.saveChanges : t.jobs.postJob}
          </button>
        </div>
      </form>
    </>
  )
}
