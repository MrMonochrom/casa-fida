import { ago, budgetText, jobStatus, timingLabel, tradeLabel } from '../format'
import { useT } from '../i18n'
import type { Job } from '../types'
import { StatusPill } from './ui'

/** The facts of a job and its description. */
export function JobDetails({ job, showClient = false }: { job: Job; showClient?: boolean }) {
  const t = useT()
  return (
    <div className="card">
      <dl className="facts-list">
        <div>
          <dt>{t.jobs.kindOfWork}</dt>
          <dd>{tradeLabel(job.trade)}</dd>
        </div>
        <div>
          <dt>{t.jobs.where}</dt>
          <dd>{job.location}</dd>
        </div>
        <div>
          <dt>{t.common.budget}</dt>
          <dd>{budgetText(job.budgetMin, job.budgetMax, job.currency)}</dd>
        </div>
        <div>
          <dt>{t.common.start}</dt>
          <dd>{timingLabel(job.timing)}</dd>
        </div>
        {showClient && (
          <div>
            <dt>{t.jobs.client}</dt>
            <dd>{job.client.name}</dd>
          </div>
        )}
        <div>
          <dt>{t.jobs.status}</dt>
          <dd>
            <StatusPill look={jobStatus(job.status)} />
          </dd>
        </div>
      </dl>
      <p className="prewrap job-description">{job.description}</p>
      <p className="muted small">{t.jobs.postedCap(ago(job.createdAt))}</p>
    </div>
  )
}
