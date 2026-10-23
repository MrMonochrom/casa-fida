import { getT } from './i18n'
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
  const t = getT().todos
  const todos: ProjectTodo[] = []
  const clientName = project.client?.name ?? project.invitedClient?.name ?? t.theClient
  if (project.status === 'proposed') {
    todos.push(
      role === 'client'
        ? { text: t.proposalToReview, urgent: true }
        : { text: t.waitingForAccept(clientName), urgent: false },
    )
  }
  if (project.pendingChanges > 0) {
    todos.push(
      role === 'client'
        ? { text: t.changesToApprove(project.pendingChanges), urgent: true, tab: 'money' }
        : { text: t.changesWaiting(project.pendingChanges), urgent: false, tab: 'money' },
    )
  }
  if (project.overdueInvoices > 0) {
    todos.push({ text: t.invoicesOverdue(project.overdueInvoices), urgent: true, tab: 'money' })
  }
  const dueNotOverdue = project.dueInvoices - project.overdueInvoices
  if (dueNotOverdue > 0) {
    todos.push({
      text: role === 'client' ? t.invoicesToPay(dueNotOverdue) : t.invoicesDue(dueNotOverdue),
      urgent: role === 'client',
      tab: 'money',
    })
  }
  return todos
}
