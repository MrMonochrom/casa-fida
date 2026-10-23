import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { FakeEventSource } from '../test/fakeEventSource'
import { makeJob, makeQuote, makeUser } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { renderAs } from '../test/render'
import { ClientJob } from './ClientJob'

vi.mock('../api')

beforeEach(resetApiMocks)

const job = makeJob({ id: 5, quoteCount: 2, pendingQuotes: 2 })
const cheap = makeQuote({
  id: 11,
  jobId: 5,
  amount: 1_790_000,
  builder: { ...makeQuote().builder, id: 6, businessName: 'Kim Renovation Co.', rating: null, reviewCount: 0 },
})
const pricey = makeQuote({ id: 12, jobId: 5, amount: 2_240_000 })

function renderJob() {
  vi.mocked(api.jobWithQuotes).mockResolvedValue({ job, quotes: [cheap, pricey] })
  return renderAs(makeUser(), <ClientJob id={5} />)
}

const quoteCard = (business: string) => screen.getByText(business).closest('li')!

describe('ClientJob', () => {
  it('shows the job and every quote', async () => {
    renderJob()
    expect(await screen.findByRole('heading', { name: 'Main bathroom remodel' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2 quotes' })).toBeInTheDocument()
    expect(within(quoteCard('Kim Renovation Co.')).getByText('$17,900')).toBeInTheDocument()
    expect(within(quoteCard('Shah Kitchen & Bath')).getByText('$22,400')).toBeInTheDocument()
    expect(screen.getByText('$18,000 – $25,000')).toBeInTheDocument()
  })

  it('hires a builder after confirming, and opens the new project', async () => {
    const { session } = renderJob()
    await screen.findByText('Kim Renovation Co.')
    await userEvent.click(within(quoteCard('Kim Renovation Co.')).getByRole('button', { name: 'Accept and hire' }))

    const dialog = screen.getByRole('dialog', { name: 'Hire Kim Renovation Co.?' })
    expect(dialog).toHaveTextContent('$17,900')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Accept and hire' }))

    expect(api.acceptQuote).toHaveBeenCalledWith(11)
    await waitFor(() => expect(window.location.pathname).toBe('/projects/500'))
    expect(session.refreshSummary).toHaveBeenCalled()
  })

  it('keeps the dialog open with the reason if hiring fails', async () => {
    vi.mocked(api.acceptQuote).mockRejectedValue(new Error('This job has already been closed or given to a builder.'))
    renderJob()
    await screen.findByText('Kim Renovation Co.')
    await userEvent.click(within(quoteCard('Kim Renovation Co.')).getByRole('button', { name: 'Accept and hire' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Accept and hire' }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('already been closed')
    expect(window.location.pathname).toBe('/')
  })

  it('declines a quote and shows the job again', async () => {
    renderJob()
    await screen.findByText('Kim Renovation Co.')
    await userEvent.click(within(quoteCard('Shah Kitchen & Bath')).getByRole('button', { name: 'Decline' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Decline quote' }))
    expect(api.declineQuote).toHaveBeenCalledWith(12)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.jobWithQuotes).toHaveBeenCalledTimes(2)
  })

  it('closes the job', async () => {
    renderJob()
    await screen.findByText('Kim Renovation Co.')
    await userEvent.click(screen.getByRole('button', { name: 'Close job' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close job' }))
    expect(api.closeJob).toHaveBeenCalledWith(5)
  })

  it('links to the project once a builder is hired, and stops offering to hire', async () => {
    vi.mocked(api.jobWithQuotes).mockResolvedValue({
      job: makeJob({ id: 5, status: 'hired', projectId: 31 }),
      quotes: [{ ...pricey, status: 'accepted', projectId: 31 }, { ...cheap, status: 'declined' }],
    })
    renderAs(makeUser(), <ClientJob id={5} />)
    expect(await screen.findByRole('link', { name: 'Go to the project' })).toHaveAttribute('href', '/projects/31')
    expect(screen.queryByRole('button', { name: 'Accept and hire' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('opens a conversation with a builder who quoted', async () => {
    renderJob()
    await screen.findByText('Kim Renovation Co.')
    await userEvent.click(within(quoteCard('Kim Renovation Co.')).getByRole('button', { name: 'Message' }))
    expect(api.openConversation).toHaveBeenCalledWith(6)
    await waitFor(() => expect(window.location.pathname).toBe('/messages/77'))
  })

  it('shows new quotes as they arrive', async () => {
    renderJob()
    await screen.findByText('Kim Renovation Co.')
    act(() => FakeEventSource.open!.emit('job', { type: 'job', jobId: 99 }))
    expect(api.jobWithQuotes).toHaveBeenCalledTimes(1)
    act(() => FakeEventSource.open!.emit('job', { type: 'job', jobId: 5 }))
    await waitFor(() => expect(api.jobWithQuotes).toHaveBeenCalledTimes(2))
  })
})
