import { useState } from 'react'
import type { FormEvent } from 'react'
import { formatMoney, moneyInputValue, parseMoney } from '../../shared/money'
import { QUOTE_MESSAGE_MAX, QUOTE_WEEKS_MAX } from '../../shared/rules'
import { api } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { JobDetails } from '../components/JobDetails'
import { MessageButton } from '../components/MessageButton'
import { BackLink, FormError, Loading, MoneyField, PageHeader, StatusPill, TextAreaField, TextField } from '../components/ui'
import { QUOTE_STATUS, ago, weeksText } from '../format'
import { Link } from '../components/Link'
import { useServerEvents } from '../serverEvents'
import type { Job, Quote } from '../types'
import { useResource } from '../useResource'

/** A job as a builder sees it, with their quote: send it, change it or withdraw it. */
export function BuilderJob({ id }: { id: number | null }) {
  const { data, error, reload, setData } = useResource(
    () => (id ? api.jobForBuilder(id) : Promise.reject(new Error("This job doesn't exist or isn't open any more."))),
    String(id),
  )

  useServerEvents((event) => {
    if (event.type === 'job' && event.jobId === id) reload()
  })

  if (!data) {
    return (
      <>
        <BackLink to="/jobs">Find work</BackLink>
        <Loading error={error} onRetry={reload} />
      </>
    )
  }

  const { job, myQuote } = data
  return (
    <>
      <BackLink to="/jobs">Find work</BackLink>
      <PageHeader
        title={job.title}
        actions={myQuote && myQuote.status !== 'withdrawn' && <MessageButton userId={job.client.id} label="Message the client" />}
      />
      <div className="two-col two-col--wide-left">
        <section className="section">
          <h2 className="section__title">The job</h2>
          <JobDetails job={job} showClient />
        </section>
        <section className="section">
          <h2 className="section__title">Your quote</h2>
          <QuotePanel job={job} quote={myQuote} onChange={(quote) => setData({ job, myQuote: quote })} onWithdrawn={reload} />
        </section>
      </div>
    </>
  )
}

interface PanelProps {
  job: Job
  quote: Quote | null
  onChange: (quote: Quote) => void
  onWithdrawn: () => void
}

function QuotePanel({ job, quote, onChange, onWithdrawn }: PanelProps) {
  const [editing, setEditing] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const open = job.status === 'open'
  const live = quote && quote.status !== 'withdrawn'

  if (!live || editing) {
    if (!open) return <p className="notice">This job isn't taking quotes any more.</p>
    return (
      <QuoteForm
        job={job}
        quote={live ? quote : null}
        onSaved={(saved) => {
          setEditing(false)
          onChange(saved)
        }}
        onCancel={live ? () => setEditing(false) : undefined}
      />
    )
  }

  return (
    <div className="card">
      {quote.status === 'accepted' && (
        <div className="banner banner--success">
          <p>
            <strong>You got the job!</strong> The client accepted your quote.
          </p>
          {quote.projectId && (
            <Link to={`/projects/${quote.projectId}`} className="button button--primary">
              Go to the project
            </Link>
          )}
        </div>
      )}
      <div className="quote__top">
        <div className="quote__price">
          <strong>{formatMoney(quote.amount)}</strong>
          {quote.weeks && <span className="muted small">about {weeksText(quote.weeks)}</span>}
        </div>
        <StatusPill look={QUOTE_STATUS[quote.status]} />
      </div>
      <p className="prewrap">{quote.message}</p>
      <p className="muted small">Sent {ago(quote.updatedAt)}</p>
      {quote.status === 'declined' && <p className="notice">The client declined this quote.</p>}
      {quote.status === 'pending' && open && (
        <div className="quote__actions">
          <button type="button" className="button button--secondary" onClick={() => setEditing(true)}>
            Change quote
          </button>
          <button type="button" className="button button--ghost" onClick={() => setWithdrawing(true)}>
            Withdraw
          </button>
        </div>
      )}
      {withdrawing && (
        <ConfirmDialog
          title="Withdraw your quote?"
          message="The client won't see it any more. You can send a new one while the job is open."
          confirmLabel="Withdraw quote"
          danger
          onConfirm={async () => {
            await api.withdrawQuote(job.id)
            setWithdrawing(false)
            onWithdrawn()
          }}
          onCancel={() => setWithdrawing(false)}
        />
      )}
    </div>
  )
}

interface FormProps {
  job: Job
  quote: Quote | null
  onSaved: (quote: Quote) => void
  onCancel?: () => void
}

function QuoteForm({ job, quote, onSaved, onCancel }: FormProps) {
  const [amount, setAmount] = useState(quote ? moneyInputValue(quote.amount) : '')
  const [weeks, setWeeks] = useState(quote?.weeks?.toString() ?? '')
  const [message, setMessage] = useState(quote?.message ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cents = parseMoney(amount)
    if (cents === null || cents <= 0) {
      setError('Enter your price, like 18,500.')
      return
    }
    const weeksText = weeks.trim()
    if (weeksText && !/^\d+$/.test(weeksText)) {
      setError('The length of the job should be a whole number of weeks.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(await api.sendQuote(job.id, { amount: cents, weeks: weeksText ? Number(weeksText) : null, message }))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <div className="form-row">
        <MoneyField label="Your price" value={amount} onChange={setAmount} required />
        <TextField
          label="How long it takes"
          extra="(weeks, optional)"
          value={weeks}
          onChange={setWeeks}
          inputMode="numeric"
          max={QUOTE_WEEKS_MAX}
        />
      </div>
      <TextAreaField
        label="What's included"
        value={message}
        onChange={setMessage}
        maxLength={QUOTE_MESSAGE_MAX}
        rows={6}
        placeholder="What the price covers, any allowances, and anything the client should know."
        required
      />
      <FormError error={error} />
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="button button--secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? 'Sending…' : quote ? 'Update quote' : 'Send quote'}
        </button>
      </div>
    </form>
  )
}
