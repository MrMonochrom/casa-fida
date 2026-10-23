import { useState } from 'react'
import type { FormEvent } from 'react'
import { moneyInputValue, parseMoney } from '../../shared/money'
import { DESCRIPTION_MAX, JOB_TIMINGS, PLACE_MAX, TITLE_MAX, TRADES, TRADE_KEYS } from '../../shared/rules'
import type { JobTiming, Trade } from '../../shared/rules'
import { api } from '../api'
import { BackLink, FormError, Loading, MoneyField, PageHeader, SelectField, TextAreaField, TextField } from '../components/ui'
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
  const [title, setTitle] = useState(job?.title ?? '')
  const [trade, setTrade] = useState<Trade | ''>(job?.trade ?? '')
  const [location, setLocation] = useState(job?.location ?? '')
  const [description, setDescription] = useState(job?.description ?? '')
  const [budgetMin, setBudgetMin] = useState(job?.budgetMin ? moneyInputValue(job.budgetMin) : '')
  const [budgetMax, setBudgetMax] = useState(job?.budgetMax ? moneyInputValue(job.budgetMax) : '')
  const [timing, setTiming] = useState<JobTiming>(job?.timing ?? 'flexible')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (job && job.status !== 'open') {
    return (
      <>
        <BackLink to={`/jobs/${job.id}`}>Back to the job</BackLink>
        <p className="notice">Only jobs that are still taking quotes can be changed.</p>
      </>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const min = optionalAmount(budgetMin)
    const max = optionalAmount(budgetMax)
    if (min === undefined || max === undefined) {
      setError('The budget should be an amount like 15,000, or left empty.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const input = { title, trade, location, description, budgetMin: min, budgetMax: max, timing }
      const saved = job ? await api.saveJob(job.id, input) : await api.postJob(input)
      navigate(`/jobs/${saved.id}`, { replace: !!job })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <BackLink to={job ? `/jobs/${job.id}` : '/jobs'}>{job ? 'Back to the job' : 'My jobs'}</BackLink>
      <PageHeader
        title={job ? 'Change your job' : 'Post a job'}
        subtitle={
          job
            ? 'Builders who already quoted will see the changes.'
            : 'Builders who offer this kind of work will see it and can send you a quote.'
        }
      />
      <form className="card form form--narrow" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Title"
          value={title}
          onChange={setTitle}
          maxLength={TITLE_MAX}
          placeholder="Main bathroom remodel"
          required
        />
        <div className="form-row">
          <SelectField label="Kind of work" value={trade} onChange={(v) => setTrade(v as Trade)} required>
            <option value="" disabled>
              Choose…
            </option>
            {TRADE_KEYS.map((key) => (
              <option key={key} value={key}>
                {TRADES[key]}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Where"
            value={location}
            onChange={setLocation}
            maxLength={PLACE_MAX}
            placeholder="Denver, CO"
            hint="A town or neighborhood is enough."
            required
          />
        </div>
        <TextAreaField
          label="Describe the work"
          value={description}
          onChange={setDescription}
          maxLength={DESCRIPTION_MAX}
          rows={6}
          placeholder="What you'd like done, rough sizes, materials you have in mind, anything builders should know."
          required
        />
        <div className="form-row">
          <MoneyField label="Budget from" extra="(optional)" value={budgetMin} onChange={setBudgetMin} />
          <MoneyField label="Budget up to" extra="(optional)" value={budgetMax} onChange={setBudgetMax} />
        </div>
        <SelectField label="When would you like to start?" value={timing} onChange={(v) => setTiming(v as JobTiming)}>
          {Object.entries(JOB_TIMINGS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={() => window.history.back()}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Saving…' : job ? 'Save changes' : 'Post job'}
          </button>
        </div>
      </form>
    </>
  )
}
