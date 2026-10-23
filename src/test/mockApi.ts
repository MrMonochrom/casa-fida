import { vi } from 'vitest'
import { api } from '../api'
import { makeBuilderDetail, makeJob, makeMessage, makeProject, makeQuote, makeUpdate, makeUser } from './fixtures'

/**
 * Default answers for the mocked API: logged out, and nothing anywhere yet.
 * Use it in test files that call vi.mock('…/api'); tests then override what they need.
 */
export function resetApiMocks() {
  for (const fn of Object.values(api)) vi.mocked(fn).mockReset()

  vi.mocked(api.me).mockResolvedValue(null)
  vi.mocked(api.login).mockResolvedValue(makeUser())
  vi.mocked(api.signup).mockImplementation(async (input) =>
    makeUser({ name: input.name, email: input.email, role: input.role }),
  )
  vi.mocked(api.logout).mockResolvedValue(undefined)
  vi.mocked(api.saveAccount).mockImplementation(async (name, phone) => makeUser({ name, phone: phone || null }))
  vi.mocked(api.changePassword).mockResolvedValue(undefined)
  vi.mocked(api.saveBuilderProfile).mockImplementation(async (profile) =>
    makeUser({ role: 'builder', builderProfile: profile }),
  )

  vi.mocked(api.builders).mockResolvedValue([])
  vi.mocked(api.builder).mockImplementation(async (id) => makeBuilderDetail({ id }))

  vi.mocked(api.postJob).mockImplementation(async (input) => makeJob({ ...input, trade: input.trade || 'kitchens' }))
  vi.mocked(api.myJobs).mockResolvedValue([])
  vi.mocked(api.saveJob).mockImplementation(async (id, input) =>
    makeJob({ id, ...input, trade: input.trade || 'kitchens' }),
  )
  vi.mocked(api.closeJob).mockImplementation(async (id) => makeJob({ id, status: 'closed' }))
  vi.mocked(api.jobWithQuotes).mockImplementation(async (id) => ({ job: makeJob({ id }), quotes: [] }))
  vi.mocked(api.acceptQuote).mockResolvedValue(500)
  vi.mocked(api.declineQuote).mockImplementation(async (id) => makeQuote({ id, status: 'declined' }))

  vi.mocked(api.openJobs).mockResolvedValue([])
  vi.mocked(api.myQuotes).mockResolvedValue([])
  vi.mocked(api.jobForBuilder).mockImplementation(async (id) => ({ job: makeJob({ id }), myQuote: null }))
  vi.mocked(api.sendQuote).mockImplementation(async (jobId, input) => makeQuote({ jobId, ...input }))
  vi.mocked(api.withdrawQuote).mockResolvedValue(undefined)

  vi.mocked(api.projects).mockResolvedValue([])
  vi.mocked(api.project).mockImplementation(async (id) => makeProject({ id }))
  vi.mocked(api.propose).mockImplementation(async (input) =>
    makeProject({ status: 'proposed', myRole: 'builder', title: input.title }),
  )
  vi.mocked(api.saveProject).mockImplementation(async (id, input) => makeProject({ id, ...input }))
  vi.mocked(api.deleteProject).mockResolvedValue(undefined)
  vi.mocked(api.inviteLink).mockResolvedValue('http://localhost:5174/invite?token=fresh')
  vi.mocked(api.acceptProject).mockImplementation(async (id) => makeProject({ id, status: 'active' }))
  vi.mocked(api.declineProject).mockImplementation(async (id) => makeProject({ id, status: 'declined' }))
  vi.mocked(api.completeProject).mockImplementation(async (id) =>
    makeProject({ id, status: 'completed', myRole: 'builder' }),
  )
  vi.mocked(api.review).mockImplementation(async (id, rating, body) =>
    makeProject({ id, status: 'completed', review: { id: 1, rating, body, createdAt: Date.now() } }),
  )

  vi.mocked(api.previewInvite).mockResolvedValue({
    businessName: 'Shah Kitchen & Bath',
    builderName: 'Priya Shah',
    title: 'Kitchen remodel',
    clientName: 'David Nguyen',
    clientEmail: 'david@example.com',
  })
  vi.mocked(api.claimInvite).mockResolvedValue(42)

  vi.mocked(api.addStage).mockImplementation(async (projectId) => makeProject({ id: projectId, myRole: 'builder' }))
  vi.mocked(api.saveStage).mockImplementation(async () => makeProject({ myRole: 'builder' }))
  vi.mocked(api.deleteStage).mockImplementation(async () => makeProject({ myRole: 'builder' }))
  vi.mocked(api.orderStages).mockImplementation(async (projectId) => makeProject({ id: projectId, myRole: 'builder' }))

  vi.mocked(api.updates).mockResolvedValue([])
  vi.mocked(api.postUpdate).mockImplementation(async (_projectId, body) => makeUpdate({ body }))
  let photoId = 900
  vi.mocked(api.addPhoto).mockImplementation(async () => {
    const id = photoId++
    return { id, url: `/api/photos/${id}` }
  })
  vi.mocked(api.deleteUpdate).mockResolvedValue(undefined)

  vi.mocked(api.addChangeOrder).mockImplementation(async (projectId) => makeProject({ id: projectId, myRole: 'builder' }))
  vi.mocked(api.approveChange).mockImplementation(async () => makeProject())
  vi.mocked(api.declineChange).mockImplementation(async () => makeProject())
  vi.mocked(api.withdrawChange).mockImplementation(async () => makeProject({ myRole: 'builder' }))
  vi.mocked(api.addInvoice).mockImplementation(async (projectId) => makeProject({ id: projectId, myRole: 'builder' }))
  vi.mocked(api.markPaid).mockImplementation(async () => makeProject({ myRole: 'builder' }))
  vi.mocked(api.voidInvoice).mockImplementation(async () => makeProject({ myRole: 'builder' }))

  vi.mocked(api.conversations).mockResolvedValue([])
  vi.mocked(api.openConversation).mockImplementation(async (userId) => ({
    id: 77,
    other: { id: userId, name: 'Marcus Reid', role: 'builder', businessName: 'Reid & Sons Construction' },
    lastMessage: null,
    unread: 0,
  }))
  vi.mocked(api.messages).mockImplementation(async (conversationId) => ({
    conversation: {
      id: conversationId,
      other: { id: 2, name: 'Marcus Reid', role: 'builder', businessName: 'Reid & Sons Construction' },
      lastMessage: null,
      unread: 0,
    },
    messages: [],
    seenUpTo: null,
  }))
  let sentId = 9000
  vi.mocked(api.sendMessage).mockImplementation(async (_id, text) => makeMessage({ id: sentId++, fromMe: true, text }))

  vi.mocked(api.summary).mockResolvedValue({ unreadMessages: 0, projects: 0, jobs: 0 })
}
