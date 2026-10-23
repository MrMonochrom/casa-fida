import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { makeBuilderUser, makeJob, makeOpenJob, makeProjectSummary, makeQuote, makeUser } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { renderAs } from '../test/render'
import { Home } from './Home'

vi.mock('../api')

beforeEach(resetApiMocks)

describe('Home', () => {
  it('lists what a client needs to do, linking to where it is done', async () => {
    vi.mocked(api.projects).mockResolvedValue([
      makeProjectSummary({ id: 1, title: 'Rear extension', pendingChanges: 1, dueInvoices: 1 }),
      makeProjectSummary({ id: 2, title: 'Kitchen remodel', status: 'proposed' }),
      makeProjectSummary({ id: 3, title: 'Old roof', status: 'completed' }),
    ])
    vi.mocked(api.myJobs).mockResolvedValue([makeJob({ id: 9, title: 'Bathroom', quoteCount: 2, pendingQuotes: 2 })])
    renderAs(makeUser(), <Home />)

    expect(await screen.findByText('4 things need your attention.')).toBeInTheDocument()
    const waiting = screen.getByRole('heading', { name: 'Waiting for you' }).parentElement!
    const links = within(waiting).getAllByRole('link')
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      [expect.stringContaining('1 change order to approve'), '/projects/1?tab=money'],
      [expect.stringContaining('1 invoice to pay'), '/projects/1?tab=money'],
      [expect.stringContaining('Proposal to review'), '/projects/2'],
      [expect.stringContaining('2 quotes to look at'), '/jobs/9'],
    ])
    // Current projects leave out finished ones.
    expect(screen.queryByText('Old roof')).not.toBeInTheDocument()
  })

  it('shows a builder new jobs in their trades and quotes still waiting', async () => {
    vi.mocked(api.openJobs).mockResolvedValue([
      makeOpenJob({ id: 4, title: 'Finish the basement' }),
      makeOpenJob({ id: 5, title: 'Already quoted', myQuote: { id: 1, amount: 100, status: 'pending' } }),
    ])
    vi.mocked(api.myQuotes).mockResolvedValue([makeQuote({ jobId: 5, job: { ...makeQuote().job, title: 'Deck' } })])
    renderAs(makeBuilderUser(), <Home />)

    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument()
    expect(api.openJobs).toHaveBeenCalledWith('mine')
    expect(screen.getByRole('link', { name: /Finish the basement/ })).toHaveAttribute('href', '/jobs/4')
    expect(screen.queryByText('Already quoted')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Deck/ })).toHaveAttribute('href', '/jobs/5')
  })
})
