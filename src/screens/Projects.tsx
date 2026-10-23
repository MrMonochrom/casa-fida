import { api } from '../api'
import { ProjectCard } from '../components/ProjectCard'
import { Empty, Loading, PageHeader } from '../components/ui'
import { Link } from '../components/Link'
import { useServerEvents } from '../serverEvents'
import { useSession } from '../session'
import type { ProjectStatus } from '../types'
import { useResource } from '../useResource'

const GROUPS: { status: ProjectStatus; title: string }[] = [
  { status: 'proposed', title: 'Proposals' },
  { status: 'active', title: 'In progress' },
  { status: 'completed', title: 'Completed' },
  { status: 'declined', title: 'Declined' },
]

/** Every project, grouped: proposals, in progress, completed, declined. */
export function Projects() {
  const { user } = useSession()
  const { data: projects, error, reload } = useResource(() => api.projects(), 'projects')

  useServerEvents((event) => {
    if (event.type === 'project') reload()
  })

  const isBuilder = user.role === 'builder'

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={
          isBuilder
            ? 'Work you’ve been hired for, and proposals you’ve sent.'
            : 'Work you’ve hired a builder for, and proposals builders have sent you.'
        }
        actions={
          isBuilder && (
            <Link to="/projects/new" className="button button--primary">
              Send a proposal
            </Link>
          )
        }
      />
      {!projects ? (
        <Loading error={error} onRetry={reload} />
      ) : projects.length === 0 ? (
        <Empty title="No projects yet.">
          {isBuilder ? (
            <>
              <p className="muted">
                A project starts when a client accepts your quote, or when you send a proposal for work you've already
                agreed on.
              </p>
              <div className="form-actions form-actions--center">
                <Link to="/projects/new" className="button button--primary">
                  Send a proposal
                </Link>
                <Link to="/jobs" className="button button--secondary">
                  Find work
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="muted">A project starts when you hire a builder from a job's quotes, or accept a builder's proposal.</p>
              <div className="form-actions form-actions--center">
                <Link to="/jobs/new" className="button button--primary">
                  Post a job
                </Link>
                <Link to="/builders" className="button button--secondary">
                  Find a builder
                </Link>
              </div>
            </>
          )}
        </Empty>
      ) : (
        GROUPS.map(({ status, title }) => {
          const group = projects.filter((p) => p.status === status)
          if (group.length === 0) return null
          return (
            <section key={status} className="section">
              <h2 className="section__title">{title}</h2>
              <div className="card-grid">
                {group.map((project) => (
                  <ProjectCard key={project.id} project={project} role={user.role} />
                ))}
              </div>
            </section>
          )
        })
      )}
    </>
  )
}
