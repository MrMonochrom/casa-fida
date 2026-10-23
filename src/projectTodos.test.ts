import { describe, expect, it } from 'vitest'
import { projectTodos } from './projectTodos'
import { makeProjectSummary } from './test/fixtures'

describe('projectTodos', () => {
  it("asks a client to answer a proposal; tells the builder who it's waiting for", () => {
    const proposal = makeProjectSummary({ status: 'proposed', client: null, invitedClient: { name: 'David', email: 'd@example.com' } })
    expect(projectTodos(proposal, 'client')).toEqual([{ text: 'Proposal to review', urgent: true }])
    expect(projectTodos(proposal, 'builder')).toEqual([{ text: 'Waiting for David to accept', urgent: false }])
  })

  it('points change orders and invoices at the money tab', () => {
    const project = makeProjectSummary({ pendingChanges: 2, dueInvoices: 3, overdueInvoices: 1 })
    expect(projectTodos(project, 'client')).toEqual([
      { text: '2 change orders to approve', urgent: true, tab: 'money' },
      { text: '1 invoice overdue', urgent: true, tab: 'money' },
      { text: '2 invoices to pay', urgent: true, tab: 'money' },
    ])
    expect(projectTodos(project, 'builder')).toEqual([
      { text: '2 change orders waiting', urgent: false, tab: 'money' },
      { text: '1 invoice overdue', urgent: true, tab: 'money' },
      { text: '2 invoices due', urgent: false, tab: 'money' },
    ])
  })

  it('has nothing for a project with nothing waiting', () => {
    expect(projectTodos(makeProjectSummary(), 'client')).toEqual([])
  })
})
