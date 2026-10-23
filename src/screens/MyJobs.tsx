import { api } from '../api'
import { CountBadge, Empty, Loading, PageHeader, StatusPill } from '../components/ui'
import { ago, budgetText, jobStatus, tradeLabel } from '../format'
import { useT } from '../i18n'
import { Link } from '../components/Link'
import { useServerEvents } from '../serverEvents'
import { useResource } from '../useResource'

/** A client's jobs, newest first. */
export function MyJobs() {
  const t = useT()
  const { data: jobs, error, reload } = useResource(() => api.myJobs(), 'my-jobs')

  useServerEvents((event) => {
    if (event.type === 'job' || event.type === 'project') reload()
  })

  return (
    <>
      <PageHeader
        title={t.nav.myJobs}
        subtitle={t.jobs.myJobsSubtitle}
        actions={
          <Link to="/jobs/new" className="button button--primary">
            {t.common.postJob}
          </Link>
        }
      />
      {!jobs ? (
        <Loading error={error} onRetry={reload} />
      ) : jobs.length === 0 ? (
        <Empty title={t.jobs.noneYet}>
          <p className="muted">{t.jobs.noneYetText}</p>
          <div className="form-actions form-actions--center">
            <Link to="/jobs/new" className="button button--primary">
              {t.common.postJob}
            </Link>
            <Link to="/builders" className="button button--secondary">
              {t.common.findBuilder}
            </Link>
          </div>
        </Empty>
      ) : (
        <ul className="list card">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link to={`/jobs/${job.id}`} className="list__row">
                <span className="list__main">
                  <strong>{job.title}</strong>
                  <span className="muted">
                    {tradeLabel(job.trade)} · {budgetText(job.budgetMin, job.budgetMax, job.currency)} ·{' '}
                    {t.jobs.posted(ago(job.createdAt))}
                  </span>
                </span>
                <span className="list__side">
                  <StatusPill look={jobStatus(job.status)} />
                  <span className="muted small">
                    {t.counts.quotes(job.quoteCount)}
                    {job.status === 'open' && job.pendingQuotes ? (
                      <CountBadge count={job.pendingQuotes} label={t.jobs.waitingForAnswer(job.pendingQuotes)} />
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
