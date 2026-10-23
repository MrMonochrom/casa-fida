import { useState } from 'react'
import { TRADE_KEYS } from '../../shared/rules'
import type { Trade } from '../../shared/rules'
import { api } from '../api'
import { Empty, Loading, PageHeader, StatusPill } from '../components/ui'
import { ago, budgetText, formatMoney, jobStatus, quoteStatus, timingLabel, tradeLabel } from '../format'
import { useT } from '../i18n'
import { Link } from '../components/Link'
import { useServerEvents } from '../serverEvents'
import { useResource } from '../useResource'

/** A builder's work: open jobs to quote on, and the quotes they've sent. */
export function FindWork({ tab }: { tab: 'jobs' | 'quotes' }) {
  const t = useT()
  return (
    <>
      <PageHeader
        title={t.common.findWork}
        subtitle={t.work.subtitle}
        actions={
          <Link to="/projects/new" className="button button--secondary">
            {t.common.sendProposal}
          </Link>
        }
      />
      <nav className="tabs" aria-label={t.common.findWork}>
        <Link to="/jobs" className={`tabs__tab ${tab === 'jobs' ? 'tabs__tab--active' : ''}`} aria-current={tab === 'jobs' ? 'page' : undefined}>
          {t.work.openJobs}
        </Link>
        <Link to="/quotes" className={`tabs__tab ${tab === 'quotes' ? 'tabs__tab--active' : ''}`} aria-current={tab === 'quotes' ? 'page' : undefined}>
          {t.work.myQuotes}
        </Link>
      </nav>
      {tab === 'jobs' ? <OpenJobs /> : <MyQuotes />}
    </>
  )
}

function OpenJobs() {
  const t = useT()
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
          aria-label={t.work.showJobsFor}
          value={trade}
          onChange={(e) => setTrade(e.target.value as Trade | 'mine' | '')}
        >
          <option value="mine">{t.work.yourTrades}</option>
          <option value="">{t.work.allTrades}</option>
          {TRADE_KEYS.map((key) => (
            <option key={key} value={key}>
              {t.trades[key]}
            </option>
          ))}
        </select>
      </div>
      {!jobs ? (
        <Loading error={error} onRetry={reload} />
      ) : jobs.length === 0 ? (
        <Empty title={t.work.noOpenJobs}>
          <p className="muted">{trade === 'mine' ? t.work.noOpenJobsMine : t.work.noOpenJobsAll}</p>
        </Empty>
      ) : (
        <div className="card-grid">
          {jobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="card card--link job-card">
              <div className="job-card__top">
                <h3 className="card__title">{job.title}</h3>
                {job.myQuote && <StatusPill look={{ label: t.status.quoted, tone: 'success' }} />}
              </div>
              <p className="muted">
                {tradeLabel(job.trade)} · {job.location}
              </p>
              <p className="job-card__description">{job.description}</p>
              <dl className="job-card__facts">
                <div>
                  <dt>{t.common.budget}</dt>
                  <dd>{budgetText(job.budgetMin, job.budgetMax, job.currency)}</dd>
                </div>
                <div>
                  <dt>{t.common.start}</dt>
                  <dd>{timingLabel(job.timing)}</dd>
                </div>
              </dl>
              <p className="muted small">
                {job.client.name} · {t.jobs.posted(ago(job.createdAt))} · {t.work.quotesSoFar(job.quoteCount)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

function MyQuotes() {
  const t = useT()
  const { data: quotes, error, reload } = useResource(() => api.myQuotes(), 'my-quotes')

  useServerEvents((event) => {
    if (event.type === 'job' || event.type === 'project') reload()
  })

  if (!quotes) return <Loading error={error} onRetry={reload} />
  if (quotes.length === 0) {
    return (
      <Empty title={t.work.noQuotesSent}>
        <p className="muted">{t.work.noQuotesSentText}</p>
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
                {quote.job.location} · {t.work.jobStatus(jobStatus(quote.job.status).label)} ·{' '}
                {t.jobs.quoteSent(ago(quote.updatedAt))}
              </span>
            </span>
            <span className="list__side">
              <strong>{formatMoney(quote.amount, quote.currency)}</strong>
              <StatusPill look={quoteStatus(quote.status)} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
