import { api } from '../api'
import { ProjectCard } from '../components/ProjectCard'
import { Empty, Loading, PageHeader } from '../components/ui'
import { Link } from '../components/Link'
import { useT } from '../i18n'
import { useServerEvents } from '../serverEvents'
import { useSession } from '../session'
import type { ProjectStatus } from '../types'
import { useResource } from '../useResource'

const GROUPS: ProjectStatus[] = ['proposed', 'active', 'completed', 'declined']

/** Every project, grouped: proposals, in progress, completed, declined. */
export function Projects() {
  const t = useT()
  const { user } = useSession()
  const { data: projects, error, reload } = useResource(() => api.projects(), 'projects')

  useServerEvents((event) => {
    if (event.type === 'project') reload()
  })

  const isBuilder = user.role === 'builder'

  return (
    <>
      <PageHeader
        title={t.nav.projects}
        subtitle={isBuilder ? t.projects.subtitleBuilder : t.projects.subtitleClient}
        actions={
          isBuilder && (
            <Link to="/projects/new" className="button button--primary">
              {t.common.sendProposal}
            </Link>
          )
        }
      />
      {!projects ? (
        <Loading error={error} onRetry={reload} />
      ) : projects.length === 0 ? (
        <Empty title={t.projects.none}>
          {isBuilder ? (
            <>
              <p className="muted">{t.projects.noneBuilder}</p>
              <div className="form-actions form-actions--center">
                <Link to="/projects/new" className="button button--primary">
                  {t.common.sendProposal}
                </Link>
                <Link to="/jobs" className="button button--secondary">
                  {t.common.findWork}
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="muted">{t.projects.noneClient}</p>
              <div className="form-actions form-actions--center">
                <Link to="/jobs/new" className="button button--primary">
                  {t.common.postJob}
                </Link>
                <Link to="/builders" className="button button--secondary">
                  {t.common.findBuilder}
                </Link>
              </div>
            </>
          )}
        </Empty>
      ) : (
        GROUPS.map((status) => {
          const group = projects.filter((p) => p.status === status)
          if (group.length === 0) return null
          return (
            <section key={status} className="section">
              <h2 className="section__title">{t.projects.groups[status]}</h2>
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
