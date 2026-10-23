import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { resizeImage } from '../../resizeImage'
import { FakeEventSource } from '../../test/fakeEventSource'
import {
  makeBuilderUser,
  makeChangeOrder,
  makeInvoice,
  makeProject,
  makeUpdate,
  makeUser,
} from '../../test/fixtures'
import { resetApiMocks } from '../../test/mockApi'
import { renderAs, visit } from '../../test/render'
import type { Project } from '../../types'
import { ProjectPage } from './ProjectPage'

vi.mock('../../api')
vi.mock('../../resizeImage', () => ({ resizeImage: vi.fn() }))

beforeEach(() => {
  resetApiMocks()
  vi.mocked(resizeImage).mockReset().mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
})

function openProject(project: Project, address = `/projects/${project.id}`) {
  vi.mocked(api.project).mockResolvedValue(project)
  visit(address)
  const user = project.myRole === 'builder' ? makeBuilderUser() : makeUser()
  return renderAs(user, <ProjectPage id={project.id} />)
}

const dialog = () => screen.getByRole('dialog')

describe('a proposal, for the client', () => {
  const proposal = makeProject({ id: 3, status: 'proposed', acceptedAt: null, title: 'Kitchen remodel' })

  it('shows the price and accepts it after confirming', async () => {
    const { session } = openProject(proposal)
    expect(await screen.findByRole('heading', { name: 'Kitchen remodel' })).toBeInTheDocument()
    expect(screen.getByText('Proposal from Reid & Sons Construction')).toBeInTheDocument()
    // No tabs until the project starts.
    expect(screen.queryByRole('navigation', { name: 'Project' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Accept proposal' }))
    expect(dialog()).toHaveTextContent('$100,000')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Accept proposal' }))
    expect(api.acceptProject).toHaveBeenCalledWith(3)
    expect(await screen.findByRole('navigation', { name: 'Project' })).toBeInTheDocument()
    expect(session.refreshSummary).toHaveBeenCalled()
  })

  it('declines it', async () => {
    openProject(proposal)
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Decline proposal' }))
    expect(api.declineProject).toHaveBeenCalledWith(3)
    expect(await screen.findByText('You declined this proposal.')).toBeInTheDocument()
  })
})

describe('a proposal, for the builder', () => {
  it('offers a fresh invite link while the client has no account', async () => {
    const proposal = makeProject({
      id: 4,
      status: 'proposed',
      myRole: 'builder',
      client: null,
      invitedClient: { name: 'David Nguyen', email: 'david@example.com' },
    })
    openProject(proposal)
    expect(await screen.findByText(/We emailed an invite to/)).toHaveTextContent('david@example.com')
    expect(screen.queryByRole('button', { name: 'Message' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Get a link to send yourself' }))
    expect(api.inviteLink).toHaveBeenCalledWith(4)
    expect(await screen.findByLabelText('Invite link')).toHaveValue('http://localhost:5174/invite?token=fresh')
  })

  it('withdraws it and goes back to the list', async () => {
    openProject(makeProject({ id: 4, status: 'proposed', myRole: 'builder' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw proposal' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Withdraw proposal' }))
    expect(api.deleteProject).toHaveBeenCalledWith(4)
    await waitFor(() => expect(window.location.pathname).toBe('/projects'))
  })

  it('edits the details, price included', async () => {
    openProject(makeProject({ id: 4, status: 'proposed', myRole: 'builder' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }))
    const price = within(dialog()).getByLabelText('Price')
    expect(price).toHaveValue('100000')
    await userEvent.clear(price)
    await userEvent.type(price, '95,500')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save changes' }))
    expect(api.saveProject).toHaveBeenCalledWith(4, {
      title: 'Rear extension',
      description: 'A 400 sq ft extension.',
      address: '1420 Elm Street',
      startDate: '2026-08-21',
      contractAmount: 9_550_000,
    })
  })
})

describe('stages', () => {
  const active = makeProject({ id: 5, myRole: 'builder' })

  it('shows progress to the client, without controls', async () => {
    openProject(makeProject({ id: 5 }))
    expect(await screen.findByText('1 of 3 stages done')).toBeInTheDocument()
    expect(screen.queryByLabelText('Status of Framing')).not.toBeInTheDocument()
  })

  it('lets the builder tick a stage off', async () => {
    openProject(active)
    await userEvent.selectOptions(await screen.findByLabelText('Status of Framing'), 'done')
    expect(api.saveStage).toHaveBeenCalledWith(2, { status: 'done' })
  })

  it('adds stages, typed or suggested', async () => {
    openProject(active)
    await userEvent.type(await screen.findByLabelText('New stage'), 'Landscaping')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(api.addStage).toHaveBeenCalledWith(5, 'Landscaping')

    await userEvent.click(screen.getByRole('button', { name: '+ Site prep' }))
    expect(api.addStage).toHaveBeenCalledWith(5, 'Site prep')
  })

  it('moves, renames and removes stages', async () => {
    openProject(active)
    await userEvent.click(await screen.findByRole('button', { name: 'Move Roofing up' }))
    expect(api.orderStages).toHaveBeenCalledWith(5, [1, 3, 2])

    await userEvent.click(screen.getByRole('button', { name: 'Rename Foundation' }))
    const name = screen.getByLabelText('Stage name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Footings{Enter}')
    expect(api.saveStage).toHaveBeenCalledWith(1, { name: 'Footings' })

    await userEvent.click(screen.getByRole('button', { name: 'Remove Roofing' }))
    expect(api.deleteStage).toHaveBeenCalledWith(3)
  })
})

describe('change orders and invoices', () => {
  it('lets the client approve a change, saying what it does to the price', async () => {
    const change = makeChangeOrder({ id: 70, title: 'Add a skylight', amount: 285_000, days: 3 })
    const { session } = openProject(makeProject({ id: 6, changeOrders: [change] }), '/projects/6?tab=money')
    expect(await screen.findByRole('heading', { name: 'Add a skylight' })).toBeInTheDocument()
    expect(screen.getByLabelText('1 waiting for you')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(dialog()).toHaveTextContent('The price changes by +$2,850, to $102,850, and the schedule by +3 days.')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Approve change' }))
    expect(api.approveChange).toHaveBeenCalledWith(70)
    expect(session.refreshSummary).toHaveBeenCalled()
  })

  it('lets the builder send a change order, including one that takes work out', async () => {
    openProject(makeProject({ id: 6, myRole: 'builder' }), '/projects/6?tab=money')
    await userEvent.click(await screen.findByRole('button', { name: 'New change order' }))
    await userEvent.type(within(dialog()).getByLabelText('Title'), 'Skip the pergola')
    await userEvent.type(within(dialog()).getByLabelText('What changes'), 'No pergola after all.')
    await userEvent.type(within(dialog()).getByLabelText('Price change'), '-1,200')
    await userEvent.type(within(dialog()).getByLabelText(/Schedule change/), '-2')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Send to client' }))
    expect(api.addChangeOrder).toHaveBeenCalledWith(6, {
      title: 'Skip the pergola',
      description: 'No pergola after all.',
      amount: -120_000,
      days: -2,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('lets the builder bill what is left in one click', async () => {
    openProject(makeProject({ id: 6, myRole: 'builder' }), '/projects/6?tab=money')
    await userEvent.click(await screen.findByRole('button', { name: 'New invoice' }))
    expect(within(dialog()).getByLabelText("What it's for")).toHaveValue('Deposit')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Bill all of it' }))
    expect(within(dialog()).getByLabelText('Amount')).toHaveValue('100000')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Send invoice' }))
    expect(api.addInvoice).toHaveBeenCalledWith(6, {
      title: 'Deposit',
      amount: 10_000_000,
      dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })
  })

  it('lets the builder mark an invoice paid; the client only sees it', async () => {
    const invoice = makeInvoice({ id: 80, number: 2, title: 'Framing complete', overdue: true })
    const { unmount } = openProject(makeProject({ id: 6, myRole: 'builder', invoices: [invoice] }), '/projects/6?tab=money')
    expect(await screen.findByText('Overdue')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Mark paid' }))
    expect(api.markPaid).toHaveBeenCalledWith(80)
    unmount()

    openProject(makeProject({ id: 6, invoices: [invoice] }), '/projects/6?tab=money')
    expect(await screen.findByText('Framing complete')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark paid' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New invoice' })).not.toBeInTheDocument()
  })
})

describe('updates', () => {
  it('shows the builder’s updates to the client', async () => {
    vi.mocked(api.updates).mockResolvedValue([
      makeUpdate({ body: 'Walls are up.', stage: { id: 2, name: 'Framing' }, photos: [{ id: 5, url: '/api/photos/5' }] }),
    ])
    openProject(makeProject({ id: 7 }), '/projects/7?tab=updates')
    expect(await screen.findByText('Walls are up.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Photo 1 of 1' })).toHaveAttribute('src', '/api/photos/5')
    expect(screen.queryByLabelText('Post an update')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Photo 1 of 1' }))
    expect(screen.getByRole('dialog', { name: 'Photo' })).toBeInTheDocument()
  })

  it('posts an update with photos, shrinking each one first', async () => {
    vi.mocked(api.postUpdate).mockResolvedValue(makeUpdate({ id: 300 }))
    openProject(makeProject({ id: 7, myRole: 'builder' }), '/projects/7?tab=updates')
    const body = await screen.findByLabelText('Post an update')
    await userEvent.type(body, 'Roof is on.')
    // The stage in progress is chosen to start with.
    expect(screen.getByLabelText('Stage this update is about')).toHaveValue('2')

    const photos = [
      new File(['a'], 'one.png', { type: 'image/png' }),
      new File(['b'], 'two.heic', { type: 'image/heic' }),
    ]
    await userEvent.upload(screen.getByLabelText(/Add photos/), photos)
    expect(screen.getAllByRole('img', { name: /New photo/ })).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Post update' }))
    expect(api.postUpdate).toHaveBeenCalledWith(7, 'Roof is on.', 2)
    await waitFor(() => expect(api.addPhoto).toHaveBeenCalledTimes(2))
    expect(resizeImage).toHaveBeenCalledWith(photos[0])
    expect(vi.mocked(api.addPhoto).mock.calls[0][0]).toBe(300)
    await waitFor(() => expect(body).toHaveValue(''))
    expect(api.updates).toHaveBeenCalledTimes(2)
  })

  it('says so if a photo fails, keeping the posted update', async () => {
    vi.mocked(resizeImage).mockRejectedValue(new Error("Couldn't read that image. Try a JPEG or PNG."))
    openProject(makeProject({ id: 7, myRole: 'builder' }), '/projects/7?tab=updates')
    await userEvent.type(await screen.findByLabelText('Post an update'), 'Roof is on.')
    await userEvent.upload(screen.getByLabelText(/Add photos/), new File(['x'], 'x.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('button', { name: 'Post update' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Your update is posted, but a photo didn't upload")
  })
})

describe('finishing', () => {
  it('lets the builder mark the project completed', async () => {
    openProject(makeProject({ id: 8, myRole: 'builder' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as completed' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Mark as completed' }))
    expect(api.completeProject).toHaveBeenCalledWith(8)
  })

  it('asks the client for a review, needing a rating', async () => {
    openProject(makeProject({ id: 8, status: 'completed', completedAt: Date.now() }))
    expect(await screen.findByRole('heading', { name: 'How did it go?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a rating')

    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }))
    await userEvent.type(screen.getByLabelText(/Your review/), 'Great work.')
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }))
    expect(api.review).toHaveBeenCalledWith(8, 4, 'Great work.')
    expect(await screen.findByRole('heading', { name: 'Your review' })).toBeInTheDocument()
  })
})

describe('live updates', () => {
  it('reloads when something changes on this project', async () => {
    openProject(makeProject({ id: 9 }))
    await screen.findByRole('heading', { name: 'Rear extension' })
    act(() => FakeEventSource.open!.emit('project', { type: 'project', projectId: 1 }))
    expect(api.project).toHaveBeenCalledTimes(1)
    act(() => FakeEventSource.open!.emit('project', { type: 'project', projectId: 9 }))
    await waitFor(() => expect(api.project).toHaveBeenCalledTimes(2))
    expect(api.updates).toHaveBeenCalledTimes(2)
  })

  it('says so when the project is gone (a withdrawn proposal)', async () => {
    vi.mocked(api.project).mockRejectedValue(new Error("This project doesn't exist."))
    visit('/projects/10')
    renderAs(makeUser(), <ProjectPage id={10} />)
    expect(await screen.findByText("This project doesn't exist.")).toBeInTheDocument()
  })
})
