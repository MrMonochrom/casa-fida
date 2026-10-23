import { formatMoney } from '../../shared/money'
import { PROJECT_STATUS } from '../format'
import { projectTodos } from '../projectTodos'
import { Link } from './Link'
import type { ProjectSummary } from '../types'
import { Progress, StatusPill } from './ui'

/** A project in a list: who it's with, how far along it is and what's waiting. */
export function ProjectCard({ project, role }: { project: ProjectSummary; role: 'client' | 'builder' }) {
  const withWhom =
    role === 'client'
      ? project.builder.businessName
      : (project.client?.name ?? `${project.invitedClient?.name ?? 'Client'} (invited)`)
  const todos = projectTodos(project, role)
  return (
    <Link to={`/projects/${project.id}`} className="card card--link project-card">
      <div className="project-card__top">
        <div>
          <h3 className="card__title">{project.title}</h3>
          <p className="muted">
            {withWhom}
            {project.address && ` · ${project.address}`}
          </p>
        </div>
        <StatusPill look={PROJECT_STATUS[project.status]} />
      </div>
      {(project.status === 'active' || project.status === 'completed') && (
        <>
          <Progress done={project.progress.done} total={project.progress.total} />
          <p className="project-card__money">
            <strong>{formatMoney(project.money.paid)}</strong> paid of {formatMoney(project.money.total)}
          </p>
        </>
      )}
      {project.status === 'proposed' && (
        <p className="project-card__money">
          Proposed price <strong>{formatMoney(project.money.total)}</strong>
        </p>
      )}
      {todos.length > 0 && (
        <ul className="todo-chips">
          {todos.map((todo) => (
            <li key={todo.text} className={`todo-chip ${todo.urgent ? 'todo-chip--urgent' : ''}`}>
              {todo.text}
            </li>
          ))}
        </ul>
      )}
    </Link>
  )
}
