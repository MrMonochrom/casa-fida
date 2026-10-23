import { plural } from './format'
import type { ProjectSummary } from './types'

export interface ProjectTodo {
  text: string
  /** Something this person needs to do, rather than wait for. */
  urgent: boolean
  /** The project page tab where it's done, if not the overview. */
  tab?: 'money'
}

/** What needs doing on a project, from the point of view of `role`. */
export function projectTodos(project: ProjectSummary, role: 'client' | 'builder'): ProjectTodo[] {
  const todos: ProjectTodo[] = []
  const clientName = project.client?.name ?? project.invitedClient?.name ?? 'the client'
  if (project.status === 'proposed') {
    todos.push(
      role === 'client'
        ? { text: 'Proposal to review', urgent: true }
        : { text: `Waiting for ${clientName} to accept`, urgent: false },
    )
  }
  if (project.pendingChanges > 0) {
    const text = plural(project.pendingChanges, 'change order')
    todos.push(
      role === 'client'
        ? { text: `${text} to approve`, urgent: true, tab: 'money' }
        : { text: `${text} waiting`, urgent: false, tab: 'money' },
    )
  }
  if (project.overdueInvoices > 0) {
    todos.push({ text: `${plural(project.overdueInvoices, 'invoice')} overdue`, urgent: true, tab: 'money' })
  }
  const dueNotOverdue = project.dueInvoices - project.overdueInvoices
  if (dueNotOverdue > 0) {
    todos.push({
      text: role === 'client' ? `${plural(dueNotOverdue, 'invoice')} to pay` : `${plural(dueNotOverdue, 'invoice')} due`,
      urgent: role === 'client',
      tab: 'money',
    })
  }
  return todos
}
