import { JOB_STATUS, ago, budgetText, timingLabel, tradeLabel } from '../format'
import type { Job } from '../types'
import { StatusPill } from './ui'

/** The facts of a job and its description. */
export function JobDetails({ job, showClient = false }: { job: Job; showClient?: boolean }) {
  return (
    <div className="card">
      <dl className="facts-list">
        <div>
          <dt>Kind of work</dt>
          <dd>{tradeLabel(job.trade)}</dd>
        </div>
        <div>
          <dt>Where</dt>
          <dd>{job.location}</dd>
        </div>
        <div>
          <dt>Budget</dt>
          <dd>{budgetText(job.budgetMin, job.budgetMax)}</dd>
        </div>
        <div>
          <dt>Start</dt>
          <dd>{timingLabel(job.timing)}</dd>
        </div>
        {showClient && (
          <div>
            <dt>Client</dt>
            <dd>{job.client.name}</dd>
          </div>
        )}
        <div>
          <dt>Status</dt>
          <dd>
            <StatusPill look={JOB_STATUS[job.status]} />
          </dd>
        </div>
      </dl>
      <p className="prewrap job-description">{job.description}</p>
      <p className="muted small">Posted {ago(job.createdAt)}</p>
    </div>
  )
}
