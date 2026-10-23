import { useState } from 'react'
import type { FormEvent } from 'react'
import { QUOTE_MESSAGE_MAX, QUOTE_WEEKS_MAX } from '../../shared/rules'
import { api } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { JobDetails } from '../components/JobDetails'
import { MessageButton } from '../components/MessageButton'
import { BackLink, FormError, Loading, MoneyField, PageHeader, StatusPill, TextAreaField, TextField } from '../components/ui'
import { ago, formatMoney, moneyInputValue, parseMoney, quoteStatus, weeksText } from '../format'
import { getT, useT } from '../i18n'
import { Link } from '../components/Link'
import { useServerEvents } from '../serverEvents'
import type { Job, Quote } from '../types'
import { useResource } from '../useResource'

/** A job as a builder sees it, with their quote: send it, change it or withdraw it. */
export function BuilderJob({ id }: { id: number | null }) {
  const t = useT()
  const { data, error, reload, setData } = useResource(
    () => (id ? api.jobForBuilder(id) : Promise.reject(new Error(getT().work.gone))),
    String(id),
  )

  useServerEvents((event) => {
    if (event.type === 'job' && event.jobId === id) reload()
  })

  if (!data) {
    return (
      <>
        <BackLink to="/jobs">{t.common.findWork}</BackLink>
        <Loading error={error} onRetry={reload} />
      </>
    )
  }

  const { job, myQuote } = data
  return (
    <>
      <BackLink to="/jobs">{t.common.findWork}</BackLink>
      <PageHeader
        title={job.title}
        actions={myQuote && myQuote.status !== 'withdrawn' && <MessageButton userId={job.client.id} label={t.work.messageClient} />}
      />
      <div className="two-col two-col--wide-left">
        <section className="section">
          <h2 className="section__title">{t.common.theJob}</h2>
          <JobDetails job={job} showClient />
        </section>
        <section className="section">
          <h2 className="section__title">{t.work.yourQuote}</h2>
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
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const open = job.status === 'open'
  const live = quote && quote.status !== 'withdrawn'

  if (!live || editing) {
    if (!open) return <p className="notice">{t.work.notTaking}</p>
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
            <strong>{t.work.gotJob}</strong> {t.work.gotJobText}
          </p>
          {quote.projectId && (
            <Link to={`/projects/${quote.projectId}`} className="button button--primary">
              {t.common.goToProject}
            </Link>
          )}
        </div>
      )}
      <div className="quote__top">
        <div className="quote__price">
          <strong>{formatMoney(quote.amount, quote.currency)}</strong>
          {quote.weeks && <span className="muted small">{t.jobs.aboutWeeks(weeksText(quote.weeks))}</span>}
        </div>
        <StatusPill look={quoteStatus(quote.status)} />
      </div>
      <p className="prewrap">{quote.message}</p>
      <p className="muted small">{t.jobs.quoteSentCap(ago(quote.updatedAt))}</p>
      {quote.status === 'declined' && <p className="notice">{t.work.declinedNotice}</p>}
      {quote.status === 'pending' && open && (
        <div className="quote__actions">
          <button type="button" className="button button--secondary" onClick={() => setEditing(true)}>
            {t.work.changeQuote}
          </button>
          <button type="button" className="button button--ghost" onClick={() => setWithdrawing(true)}>
            {t.common.withdraw}
          </button>
        </div>
      )}
      {withdrawing && (
        <ConfirmDialog
          title={t.work.withdrawTitle}
          message={t.work.withdrawText}
          confirmLabel={t.work.withdrawQuote}
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
  const t = useT()
  const [amount, setAmount] = useState(quote ? moneyInputValue(quote.amount) : '')
  const [weeks, setWeeks] = useState(quote?.weeks?.toString() ?? '')
  const [message, setMessage] = useState(quote?.message ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cents = parseMoney(amount)
    if (cents === null || cents <= 0) {
      setError(t.work.priceInvalid)
      return
    }
    const weeksText = weeks.trim()
    if (weeksText && !/^\d+$/.test(weeksText)) {
      setError(t.work.weeksWhole)
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(
        await api.sendQuote(job.id, {
          amount: cents,
          currency: job.currency,
          weeks: weeksText ? Number(weeksText) : null,
          message,
        }),
      )
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <div className="form-row">
        <MoneyField label={t.work.yourPrice} value={amount} onChange={setAmount} currency={job.currency} required />
        <TextField
          label={t.work.howLong}
          extra={t.work.weeksOptional}
          value={weeks}
          onChange={setWeeks}
          inputMode="numeric"
          max={QUOTE_WEEKS_MAX}
        />
      </div>
      <TextAreaField
        label={t.common.whatsIncluded}
        value={message}
        onChange={setMessage}
        maxLength={QUOTE_MESSAGE_MAX}
        rows={6}
        placeholder={t.work.quotePlaceholder}
        required
      />
      <FormError error={error} />
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="button button--secondary" onClick={onCancel}>
            {t.common.cancel}
          </button>
        )}
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? t.common.sending : quote ? t.work.updateQuote : t.work.sendQuote}
        </button>
      </div>
    </form>
  )
}
