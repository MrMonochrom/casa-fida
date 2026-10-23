import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { makeBuilderUser, makeOpenJob, makeProjectSummary, makeQuote, makeUser } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { renderAs } from '../test/render'
import { FindWork } from './FindWork'
import { Projects } from './Projects'

vi.mock('../api')

beforeEach(resetApiMocks)

describe('FindWork', () => {
  it("shows open jobs in the builder's trades first, and others on request", async () => {
    vi.mocked(api.openJobs).mockResolvedValue([
      makeOpenJob({ id: 4, title: 'Finish the basement', quoteCount: 1 }),
      makeOpenJob({ id: 6, title: 'Repaint the house', myQuote: { id: 3, amount: 900_000, status: 'pending' } }),
    ])
    renderAs(makeBuilderUser(), <FindWork tab="jobs" />)
    expect(await screen.findByRole('link', { name: /Finish the basement/ })).toHaveAttribute('href', '/jobs/4')
    expect(api.openJobs).toHaveBeenCalledWith('mine')
    expect(within(screen.getByRole('link', { name: /Repaint the house/ })).getByText('Quoted')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Show jobs for'), '')
    await waitFor(() => expect(api.openJobs).toHaveBeenLastCalledWith(''))
  })

  it('lists sent quotes, linking accepted ones to their project', async () => {
    vi.mocked(api.myQuotes).mockResolvedValue([
      makeQuote({ jobId: 8, status: 'accepted', projectId: 31, job: { ...makeQuote().job, id: 8, title: 'Deck', status: 'hired' } }),
      makeQuote({ jobId: 9, job: { ...makeQuote().job, id: 9, title: 'Bathroom' } }),
    ])
    renderAs(makeBuilderUser(), <FindWork tab="quotes" />)
    expect(await screen.findByRole('link', { name: /Deck/ })).toHaveAttribute('href', '/projects/31')
    expect(screen.getByRole('link', { name: /Bathroom/ })).toHaveAttribute('href', '/jobs/9')
    expect(screen.getByRole('link', { name: 'My quotes' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('Projects', () => {
  it('groups projects by where they are', async () => {
    vi.mocked(api.projects).mockResolvedValue([
      makeProjectSummary({ title: 'Kitchen remodel', status: 'proposed' }),
      makeProjectSummary({ title: 'Rear extension', status: 'active' }),
      makeProjectSummary({ title: 'New roof', status: 'completed' }),
    ])
    renderAs(makeUser(), <Projects />)
    const proposals = (await screen.findByRole('heading', { name: 'Proposals' })).parentElement!
    expect(within(proposals).getByText('Kitchen remodel')).toBeInTheDocument()
    expect(within(proposals).getByText('Proposal to review')).toBeInTheDocument()
    expect(within(screen.getByRole('heading', { name: 'In progress' }).parentElement!).getByText('Rear extension')).toBeInTheDocument()
    expect(within(screen.getByRole('heading', { name: 'Completed' }).parentElement!).getByText('New roof')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Declined' })).not.toBeInTheDocument()
  })

  it('suggests how projects start when there are none', async () => {
    renderAs(makeBuilderUser(), <Projects />)
    expect(await screen.findByText('No projects yet.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Send a proposal' })[0]).toHaveAttribute('href', '/projects/new')
  })
})
