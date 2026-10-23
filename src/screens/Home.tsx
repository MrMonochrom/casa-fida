import { api } from '../api'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { ProjectCard } from '../components/ProjectCard'
import { Empty, Loading, PageHeader } from '../components/ui'
import { ago, budgetText, formatMoney, jobStatus, tradeLabel } from '../format'
import { getT, useT } from '../i18n'
import { projectTodos } from '../projectTodos'
import { Link } from '../components/Link'
import { useServerEvents } from '../serverEvents'
import { useSession } from '../session'
import type { Job, OpenJob, ProjectSummary, Quote, User } from '../types'
import { useResource } from '../useResource'

interface HomeData {
  projects: ProjectSummary[]
  /** Clients: their jobs. Builders: open jobs in their trades. */
  jobs: (Job | OpenJob)[]
  /** Builders only. */
  quotes: Quote[]
}

async function loadHome(user: User): Promise<HomeData> {
  if (user.role === 'client') {
    const [projects, jobs] = await Promise.all([api.projects(), api.myJobs()])
    return { projects, jobs, quotes: [] }
  }
  const [projects, jobs, quotes] = await Promise.all([api.projects(), api.openJobs('mine'), api.myQuotes()])
  return { projects, jobs, quotes }
}

function ActionCard({ to, icon, title, text }: { to: string; icon: IconName; title: string; text: string }) {
  return (
    <Link to={to} className="card card--link action-card">
      <span className="action-card__icon">
        <Icon name={icon} size={22} />
      </span>
      <span>
        <strong className="action-card__title">{title}</strong>
        <span className="muted">{text}</span>
      </span>
    </Link>
  )
}

interface Todo {
  key: string
  to: string
  title: string
  detail: string
  urgent: boolean
}

function todosFor(user: User, data: HomeData): Todo[] {
  const todos: Todo[] = []
  for (const project of data.projects) {
    if (project.status !== 'proposed' && project.status !== 'active' && project.status !== 'completed') continue
    for (const todo of projectTodos(project, user.role)) {
      // A builder waiting on a client isn't something they can do anything about.
      if (user.role === 'builder' && !todo.urgent) continue
      todos.push({
        key: `p${project.id}-${todo.text}`,
        to: `/projects/${project.id}${todo.tab ? `?tab=${todo.tab}` : ''}`,
        title: todo.text,
        detail: project.title,
        urgent: todo.urgent,
      })
    }
  }
  if (user.role === 'client') {
    for (const job of data.jobs as Job[]) {
      if (job.status === 'open' && job.pendingQuotes) {
        todos.push({
          key: `j${job.id}`,
          to: `/jobs/${job.id}`,
          title: getT().home.quotesToLookAt(job.pendingQuotes),
          detail: job.title,
          urgent: true,
        })
      }
    }
  }
  return todos
}

export function Home() {
  const t = useT()
  const { user } = useSession()
  const { data, error, reload } = useResource(() => loadHome(user), `home-${user.id}`)

  useServerEvents((event) => {
    if (event.type === 'project' || event.type === 'job') reload()
  })

  const firstName = user.name.split(' ')[0]
  const isClient = user.role === 'client'

  const actions = isClient ? (
    <div className="action-grid">
      <ActionCard to="/jobs/new" icon="plus" title={t.common.postJob} text={t.home.postJobText} />
      <ActionCard to="/builders" icon="search" title={t.common.findBuilder} text={t.home.findBuilderText} />
    </div>
  ) : (
    <div className="action-grid">
      <ActionCard to="/jobs" icon="briefcase" title={t.common.findWork} text={t.home.findWorkText} />
      <ActionCard to="/projects/new" icon="plus" title={t.common.sendProposal} text={t.home.sendProposalText} />
    </div>
  )

  if (!data) {
    return (
      <>
        <PageHeader title={t.home.hi(firstName)} />
        {actions}
        <Loading error={error} onRetry={reload} />
      </>
    )
  }

  const todos = todosFor(user, data)
  const current = data.projects.filter((p) => p.status === 'active' || p.status === 'proposed')

  return (
    <>
      <PageHeader
        title={t.home.hi(firstName)}
        subtitle={todos.length ? t.home.attention(todos.length) : t.home.caughtUp}
      />
      {actions}

      {todos.length > 0 && (
        <section className="section">
          <h2 className="section__title">{t.home.waiting}</h2>
          <ul className="list card">
            {todos.map((todo) => (
              <li key={todo.key}>
                <Link to={todo.to} className="list__row">
                  <span className={`dot ${todo.urgent ? 'dot--urgent' : ''}`} aria-hidden="true" />
                  <span className="list__main">
                    <strong>{todo.title}</strong>
                    <span className="muted">{todo.detail}</span>
                  </span>
                  <span className="list__chevron" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="section__header">
          <h2 className="section__title">{t.home.currentProjects}</h2>
          <Link to="/projects" className="text-link">
            {t.home.allProjects}
          </Link>
        </div>
        {current.length === 0 ? (
          <Empty title={t.home.noCurrent}>
            <p className="muted">{isClient ? t.home.noCurrentClient : t.home.noCurrentBuilder}</p>
          </Empty>
        ) : (
          <div className="card-grid">
            {current.map((project) => (
              <ProjectCard key={project.id} project={project} role={user.role} />
            ))}
          </div>
        )}
      </section>

      {isClient ? <ClientJobsSection jobs={data.jobs as Job[]} /> : <BuilderWorkSection data={data} />}
    </>
  )
}

function ClientJobsSection({ jobs }: { jobs: Job[] }) {
  const t = useT()
  const open = jobs.filter((j) => j.status === 'open')
  if (open.length === 0) return null
  return (
    <section className="section">
      <div className="section__header">
        <h2 className="section__title">{t.home.jobsTakingQuotes}</h2>
        <Link to="/jobs" className="text-link">
          {t.home.allJobs}
        </Link>
      </div>
      <ul className="list card">
        {open.map((job) => (
          <li key={job.id}>
            <Link to={`/jobs/${job.id}`} className="list__row">
              <span className="list__main">
                <strong>{job.title}</strong>
                <span className="muted">
                  {tradeLabel(job.trade)} · {t.jobs.posted(ago(job.createdAt))}
                </span>
              </span>
              <span className="list__side">{t.counts.quotes(job.quoteCount)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function BuilderWorkSection({ data }: { data: HomeData }) {
  const t = useT()
  const fresh = (data.jobs as OpenJob[]).filter((j) => !j.myQuote).slice(0, 5)
  const pending = data.quotes.filter((q) => q.status === 'pending')
  return (
    <div className="two-col">
      <section className="section">
        <div className="section__header">
          <h2 className="section__title">{t.home.newJobs}</h2>
          <Link to="/jobs" className="text-link">
            {t.common.findWork}
          </Link>
        </div>
        {fresh.length === 0 ? (
          <Empty title={t.home.noNewJobs}>
            <p className="muted">{t.home.noNewJobsText}</p>
          </Empty>
        ) : (
          <ul className="list card">
            {fresh.map((job) => (
              <li key={job.id}>
                <Link to={`/jobs/${job.id}`} className="list__row">
                  <span className="list__main">
                    <strong>{job.title}</strong>
                    <span className="muted">
                      {job.location} · {budgetText(job.budgetMin, job.budgetMax, job.currency)}
                    </span>
                  </span>
                  <span className="list__side muted">{ago(job.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="section">
        <div className="section__header">
          <h2 className="section__title">{t.home.quotesWaiting}</h2>
          <Link to="/quotes" className="text-link">
            {t.home.allQuotes}
          </Link>
        </div>
        {pending.length === 0 ? (
          <Empty title={t.home.noQuotesWaiting}>
            <p className="muted">{t.home.noQuotesWaitingText}</p>
          </Empty>
        ) : (
          <ul className="list card">
            {pending.map((quote) => (
              <li key={quote.id}>
                <Link to={`/jobs/${quote.jobId}`} className="list__row">
                  <span className="list__main">
                    <strong>{quote.job.title}</strong>
                    <span className="muted">
                      {jobStatus(quote.job.status).label} · {t.jobs.quoteSent(ago(quote.updatedAt))}
                    </span>
                  </span>
                  <span className="list__side">{formatMoney(quote.amount, quote.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
