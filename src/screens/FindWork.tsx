import { useState } from 'react'
import { formatMoney } from '../../shared/money'
import { TRADES, TRADE_KEYS } from '../../shared/rules'
import type { Trade } from '../../shared/rules'
import { api } from '../api'
import { Empty, Loading, PageHeader, StatusPill } from '../components/ui'
import { JOB_STATUS, QUOTE_STATUS, ago, budgetText, plural, timingLabel, tradeLabel } from '../format'
import { Link } from '../components/Link'
import { useServerEvents } from '../serverEvents'
import { useResource } from '../useResource'

/** A builder's work: open jobs to quote on, and the quotes they've sent. */
export function FindWork({ tab }: { tab: 'jobs' | 'quotes' }) {
  return (
    <>
      <PageHeader
        title="Find work"
        subtitle="Jobs clients have posted, and the quotes you've sent."
        actions={
          <Link to="/projects/new" className="button button--secondary">
            Send a proposal
          </Link>
        }
      />
      <nav className="tabs" aria-label="Find work">
        <Link to="/jobs" className={`tabs__tab ${tab === 'jobs' ? 'tabs__tab--active' : ''}`} aria-current={tab === 'jobs' ? 'page' : undefined}>
          Open jobs
        </Link>
        <Link to="/quotes" className={`tabs__tab ${tab === 'quotes' ? 'tabs__tab--active' : ''}`} aria-current={tab === 'quotes' ? 'page' : undefined}>
          My quotes
        </Link>
      </nav>
      {tab === 'jobs' ? <OpenJobs /> : <MyQuotes />}
    </>
  )
}

function OpenJobs() {
  const [trade, setTrade] = useState<Trade | 'mine' | ''>('mine')
  const { data: jobs, error, reload } = useResource(() => api.openJobs(trade), trade)

  useServerEvents((event) => {
    if (event.type === 'job') reload()
  })

  return (
    <>
      <div className="filters">
        <select
          className="input select"
          aria-label="Show jobs for"
          value={trade}
          onChange={(e) => setTrade(e.target.value as Trade | 'mine' | '')}
        >
          <option value="mine">Your trades</option>
          <option value="">All trades</option>
          {TRADE_KEYS.map((key) => (
            <option key={key} value={key}>
              {TRADES[key]}
            </option>
          ))}
        </select>
      </div>
      {!jobs ? (
        <Loading error={error} onRetry={reload} />
      ) : jobs.length === 0 ? (
        <Empty title="No open jobs here right now.">
          <p className="muted">
            {trade === 'mine' ? 'Try "All trades", or check back soon.' : 'Check back soon: clients post new jobs every day.'}
          </p>
        </Empty>
      ) : (
        <div className="card-grid">
          {jobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="card card--link job-card">
              <div className="job-card__top">
                <h3 className="card__title">{job.title}</h3>
                {job.myQuote && <StatusPill look={{ label: 'Quoted', tone: 'success' }} />}
              </div>
              <p className="muted">
                {tradeLabel(job.trade)} · {job.location}
              </p>
              <p className="job-card__description">{job.description}</p>
              <dl className="job-card__facts">
                <div>
                  <dt>Budget</dt>
                  <dd>{budgetText(job.budgetMin, job.budgetMax)}</dd>
                </div>
                <div>
                  <dt>Start</dt>
                  <dd>{timingLabel(job.timing)}</dd>
                </div>
              </dl>
              <p className="muted small">
                {job.client.name} · posted {ago(job.createdAt)} · {plural(job.quoteCount, 'quote')} so far
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

function MyQuotes() {
  const { data: quotes, error, reload } = useResource(() => api.myQuotes(), 'my-quotes')

  useServerEvents((event) => {
    if (event.type === 'job' || event.type === 'project') reload()
  })

  if (!quotes) return <Loading error={error} onRetry={reload} />
  if (quotes.length === 0) {
    return (
      <Empty title="You haven't sent any quotes yet.">
        <p className="muted">Open a job to send the client your price.</p>
      </Empty>
    )
  }
  return (
    <ul className="list card">
      {quotes.map((quote) => (
        <li key={quote.id}>
          <Link to={quote.projectId ? `/projects/${quote.projectId}` : `/jobs/${quote.jobId}`} className="list__row">
            <span className="list__main">
              <strong>{quote.job.title}</strong>
              <span className="muted">
                {quote.job.location} · job {JOB_STATUS[quote.job.status].label.toLowerCase()} · sent{' '}
                {ago(quote.updatedAt)}
              </span>
            </span>
            <span className="list__side">
              <strong>{formatMoney(quote.amount)}</strong>
              <StatusPill look={QUOTE_STATUS[quote.status]} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
