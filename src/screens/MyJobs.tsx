import { api } from '../api'
import { CountBadge, Empty, Loading, PageHeader, StatusPill } from '../components/ui'
import { JOB_STATUS, ago, budgetText, plural, tradeLabel } from '../format'
import { Link } from '../components/Link'
import { useServerEvents } from '../serverEvents'
import { useResource } from '../useResource'

/** A client's jobs, newest first. */
export function MyJobs() {
  const { data: jobs, error, reload } = useResource(() => api.myJobs(), 'my-jobs')

  useServerEvents((event) => {
    if (event.type === 'job' || event.type === 'project') reload()
  })

  return (
    <>
      <PageHeader
        title="My jobs"
        subtitle="Describe work you need done and builders in that trade can send you quotes."
        actions={
          <Link to="/jobs/new" className="button button--primary">
            Post a job
          </Link>
        }
      />
      {!jobs ? (
        <Loading error={error} onRetry={reload} />
      ) : jobs.length === 0 ? (
        <Empty title="You haven't posted any jobs yet.">
          <p className="muted">Post a job to get quotes from local builders, or find a builder and message them.</p>
          <div className="form-actions form-actions--center">
            <Link to="/jobs/new" className="button button--primary">
              Post a job
            </Link>
            <Link to="/builders" className="button button--secondary">
              Find a builder
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
                    {tradeLabel(job.trade)} · {budgetText(job.budgetMin, job.budgetMax)} · posted {ago(job.createdAt)}
                  </span>
                </span>
                <span className="list__side">
                  <StatusPill look={JOB_STATUS[job.status]} />
                  <span className="muted small">
                    {plural(job.quoteCount, 'quote')}
                    {job.status === 'open' && job.pendingQuotes ? (
                      <CountBadge count={job.pendingQuotes} label={`${job.pendingQuotes} waiting for an answer`} />
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
