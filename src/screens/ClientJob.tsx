import { useState } from 'react'
import { api } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { JobDetails } from '../components/JobDetails'
import { MessageButton } from '../components/MessageButton'
import { Avatar, BackLink, Empty, Loading, PageHeader, Rating, StatusPill } from '../components/ui'
import { ago, formatMoney, quoteStatus, weeksText } from '../format'
import { fill, getT, useT } from '../i18n'
import { Link } from '../components/Link'
import { navigate } from '../router'
import { useServerEvents } from '../serverEvents'
import { useSession } from '../session'
import type { Quote } from '../types'
import { useResource } from '../useResource'

type Pending = { action: 'accept' | 'decline'; quote: Quote } | { action: 'close' } | null

/** A client's job: its details and the quotes builders sent, to compare and hire from. */
export function ClientJob({ id }: { id: number | null }) {
  const t = useT()
  const { refreshSummary } = useSession()
  const { data, error, reload } = useResource(
    () => (id ? api.jobWithQuotes(id) : Promise.reject(new Error(getT().jobs.gone))),
    String(id),
  )
  const [pending, setPending] = useState<Pending>(null)

  useServerEvents((event) => {
    if (event.type === 'job' && event.jobId === id) reload()
  })

  if (!data) {
    return (
      <>
        <BackLink to="/jobs">{t.nav.myJobs}</BackLink>
        <Loading error={error} onRetry={reload} />
      </>
    )
  }

  const { job, quotes } = data
  const open = job.status === 'open'

  async function confirm() {
    if (!pending) return
    if (pending.action === 'accept') {
      const projectId = await api.acceptQuote(pending.quote.id)
      refreshSummary()
      navigate(`/projects/${projectId}`)
      return
    }
    if (pending.action === 'decline') await api.declineQuote(pending.quote.id)
    else await api.closeJob(job.id)
    await reload()
    refreshSummary()
    setPending(null)
  }

  const hired = quotes.find((q) => q.status === 'accepted')

  return (
    <>
      <BackLink to="/jobs">{t.nav.myJobs}</BackLink>
      <PageHeader
        title={job.title}
        actions={
          open && (
            <>
              <Link to={`/jobs/${job.id}/edit`} className="button button--secondary">
                {t.common.edit}
              </Link>
              <button type="button" className="button button--secondary" onClick={() => setPending({ action: 'close' })}>
                {t.jobs.closeJob}
              </button>
            </>
          )
        }
      />

      {job.status === 'hired' && job.projectId && (
        <div className="banner banner--success">
          <p>{fill(t.jobs.hired, { builder: <strong>{hired?.builder.businessName ?? t.jobs.aBuilder}</strong> })}</p>
          <Link to={`/projects/${job.projectId}`} className="button button--primary">
            {t.common.goToProject}
          </Link>
        </div>
      )}

      <div className="two-col two-col--wide-right">
        <section className="section">
          <h2 className="section__title">{t.common.theJob}</h2>
          <JobDetails job={job} />
        </section>

        <section className="section">
          <h2 className="section__title">
            {quotes.length ? t.counts.quotes(quotes.length) : t.jobs.quotesHeading}
          </h2>
          {quotes.length === 0 ? (
            <Empty title={open ? t.jobs.noQuotesYet : t.jobs.noQuotes}>
              {open && (
                <p className="muted">
                  {fill(t.jobs.noQuotesText, {
                    browse: (
                      <Link to="/builders" className="text-link">
                        {t.jobs.browseBuilders}
                      </Link>
                    ),
                  })}
                </p>
              )}
            </Empty>
          ) : (
            <ul className="quotes">
              {quotes.map((quote) => (
                <QuoteCard
                  key={quote.id}
                  quote={quote}
                  canAnswer={open && quote.status === 'pending'}
                  onAccept={() => setPending({ action: 'accept', quote })}
                  onDecline={() => setPending({ action: 'decline', quote })}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {pending?.action === 'accept' && (
        <ConfirmDialog
          title={t.jobs.hireTitle(pending.quote.builder.businessName)}
          message={<p>{fill(t.jobs.hireText, { amount: <strong>{formatMoney(pending.quote.amount, pending.quote.currency)}</strong> })}</p>}
          confirmLabel={t.jobs.acceptAndHire}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.action === 'decline' && (
        <ConfirmDialog
          title={t.jobs.declineTitle}
          message={t.jobs.declineText(pending.quote.builder.businessName)}
          confirmLabel={t.jobs.declineQuote}
          danger
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.action === 'close' && (
        <ConfirmDialog
          title={t.jobs.closeTitle}
          message={t.jobs.closeText}
          confirmLabel={t.jobs.closeJob}
          danger
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  )
}

interface QuoteCardProps {
  quote: Quote
  canAnswer: boolean
  onAccept: () => void
  onDecline: () => void
}

function QuoteCard({ quote, canAnswer, onAccept, onDecline }: QuoteCardProps) {
  const t = useT()
  const { builder } = quote
  return (
    <li className={`card quote ${quote.status === 'accepted' ? 'quote--accepted' : ''}`}>
      <div className="quote__top">
        <Link to={`/builders/${builder.id}`} className="quote__builder">
          <Avatar name={builder.businessName} size="small" />
          <span>
            <strong>{builder.businessName}</strong>
            <span className="muted small">{builder.serviceArea}</span>
          </span>
        </Link>
        <div className="quote__price">
          <strong>{formatMoney(quote.amount, quote.currency)}</strong>
          {quote.weeks && <span className="muted small">{t.jobs.aboutWeeks(weeksText(quote.weeks))}</span>}
        </div>
      </div>
      <div className="quote__meta">
        <Rating rating={builder.rating} count={builder.reviewCount} />
        {builder.licensed && <span className="fact">{t.common.licensed}</span>}
        {builder.insured && <span className="fact">{t.common.insured}</span>}
        <StatusPill look={quoteStatus(quote.status)} />
      </div>
      <p className="prewrap">{quote.message}</p>
      <p className="muted small">
        {quote.updatedAt - quote.createdAt > 60_000
          ? t.jobs.quoteUpdated(ago(quote.updatedAt))
          : t.jobs.quoteSentCap(ago(quote.createdAt))}
      </p>
      <div className="quote__actions">
        {canAnswer && (
          <>
            <button type="button" className="button button--primary" onClick={onAccept}>
              {t.jobs.acceptAndHire}
            </button>
            <button type="button" className="button button--secondary" onClick={onDecline}>
              {t.common.decline}
            </button>
          </>
        )}
        <MessageButton userId={builder.id} className="button button--ghost" />
      </div>
    </li>
  )
}
