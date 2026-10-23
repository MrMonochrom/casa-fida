import { useState } from 'react'
import { formatMoney } from '../../shared/money'
import { api } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { JobDetails } from '../components/JobDetails'
import { MessageButton } from '../components/MessageButton'
import { Avatar, BackLink, Empty, Loading, PageHeader, Rating, StatusPill } from '../components/ui'
import { QUOTE_STATUS, ago, plural, weeksText } from '../format'
import { Link } from '../components/Link'
import { navigate } from '../router'
import { useServerEvents } from '../serverEvents'
import { useSession } from '../session'
import type { Quote } from '../types'
import { useResource } from '../useResource'

type Pending = { action: 'accept' | 'decline'; quote: Quote } | { action: 'close' } | null

/** A client's job: its details and the quotes builders sent, to compare and hire from. */
export function ClientJob({ id }: { id: number | null }) {
  const { refreshSummary } = useSession()
  const { data, error, reload } = useResource(
    () => (id ? api.jobWithQuotes(id) : Promise.reject(new Error("This job doesn't exist."))),
    String(id),
  )
  const [pending, setPending] = useState<Pending>(null)

  useServerEvents((event) => {
    if (event.type === 'job' && event.jobId === id) reload()
  })

  if (!data) {
    return (
      <>
        <BackLink to="/jobs">My jobs</BackLink>
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
      <BackLink to="/jobs">My jobs</BackLink>
      <PageHeader
        title={job.title}
        actions={
          open && (
            <>
              <Link to={`/jobs/${job.id}/edit`} className="button button--secondary">
                Edit
              </Link>
              <button type="button" className="button button--secondary" onClick={() => setPending({ action: 'close' })}>
                Close job
              </button>
            </>
          )
        }
      />

      {job.status === 'hired' && job.projectId && (
        <div className="banner banner--success">
          <p>
            You hired <strong>{hired?.builder.businessName ?? 'a builder'}</strong> for this job.
          </p>
          <Link to={`/projects/${job.projectId}`} className="button button--primary">
            Go to the project
          </Link>
        </div>
      )}

      <div className="two-col two-col--wide-right">
        <section className="section">
          <h2 className="section__title">The job</h2>
          <JobDetails job={job} />
        </section>

        <section className="section">
          <h2 className="section__title">
            {quotes.length ? plural(quotes.length, 'quote') : 'Quotes'}
          </h2>
          {quotes.length === 0 ? (
            <Empty title={open ? 'No quotes yet.' : 'No quotes.'}>
              {open && (
                <p className="muted">
                  Builders who offer this kind of work can see your job. You'll be notified here when a quote arrives.{' '}
                  <Link to="/builders" className="text-link">
                    Browse builders
                  </Link>{' '}
                  to invite one to quote.
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
          title={`Hire ${pending.quote.builder.businessName}?`}
          message={
            <>
              <p>
                This accepts their quote of <strong>{formatMoney(pending.quote.amount)}</strong> and starts the project.
                Any other quotes on this job are declined, and the job stops taking new ones.
              </p>
            </>
          }
          confirmLabel="Accept and hire"
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.action === 'decline' && (
        <ConfirmDialog
          title="Decline this quote?"
          message={`${pending.quote.builder.businessName} will see that you declined it. Your job stays open for other quotes.`}
          confirmLabel="Decline quote"
          danger
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.action === 'close' && (
        <ConfirmDialog
          title="Close this job?"
          message="Builders won't be able to send quotes any more, and quotes still waiting for an answer are declined."
          confirmLabel="Close job"
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
          <strong>{formatMoney(quote.amount)}</strong>
          {quote.weeks && <span className="muted small">about {weeksText(quote.weeks)}</span>}
        </div>
      </div>
      <div className="quote__meta">
        <Rating rating={builder.rating} count={builder.reviewCount} />
        {builder.licensed && <span className="fact">Licensed</span>}
        {builder.insured && <span className="fact">Insured</span>}
        <StatusPill look={QUOTE_STATUS[quote.status]} />
      </div>
      <p className="prewrap">{quote.message}</p>
      <p className="muted small">
        {quote.updatedAt - quote.createdAt > 60_000 ? `Updated ${ago(quote.updatedAt)}` : `Sent ${ago(quote.createdAt)}`}
      </p>
      <div className="quote__actions">
        {canAnswer && (
          <>
            <button type="button" className="button button--primary" onClick={onAccept}>
              Accept and hire
            </button>
            <button type="button" className="button button--secondary" onClick={onDecline}>
              Decline
            </button>
          </>
        )}
        <MessageButton userId={builder.id} className="button button--ghost" />
      </div>
    </li>
  )
}
