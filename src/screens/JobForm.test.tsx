import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { makeJob, makeUser } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { renderAs } from '../test/render'
import { JobForm } from './JobForm'

vi.mock('../api')

beforeEach(resetApiMocks)

describe('JobForm', () => {
  it('posts a job, with the budget in cents, and opens it', async () => {
    vi.mocked(api.postJob).mockResolvedValue(makeJob({ id: 61 }))
    renderAs(makeUser(), <JobForm />)
    await userEvent.type(await screen.findByLabelText('Title'), 'Finish the basement')
    await userEvent.selectOptions(screen.getByLabelText('Kind of work'), 'basements_attics')
    await userEvent.type(screen.getByLabelText('Where'), 'Littleton, CO')
    await userEvent.type(screen.getByLabelText('Describe the work'), 'Family room and a guest bedroom.')
    await userEvent.type(screen.getByLabelText(/Budget from/), '30,000')
    await userEvent.type(screen.getByLabelText(/Budget up to/), '$45000')
    await userEvent.selectOptions(screen.getByLabelText('When would you like to start?'), 'asap')
    await userEvent.click(screen.getByRole('button', { name: 'Post job' }))

    expect(api.postJob).toHaveBeenCalledWith({
      title: 'Finish the basement',
      trade: 'basements_attics',
      location: 'Littleton, CO',
      description: 'Family room and a guest bedroom.',
      budgetMin: 3_000_000,
      budgetMax: 4_500_000,
      timing: 'asap',
    })
    await waitFor(() => expect(window.location.pathname).toBe('/jobs/61'))
  })

  it('leaves out a budget that was left empty', async () => {
    renderAs(makeUser(), <JobForm />)
    await userEvent.type(await screen.findByLabelText('Title'), 'Paint')
    await userEvent.click(screen.getByRole('button', { name: 'Post job' }))
    expect(api.postJob).toHaveBeenCalledWith(expect.objectContaining({ budgetMin: null, budgetMax: null, timing: 'flexible' }))
  })

  it("explains a budget it can't read", async () => {
    renderAs(makeUser(), <JobForm />)
    await userEvent.type(await screen.findByLabelText(/Budget up to/), 'twenty grand')
    await userEvent.click(screen.getByRole('button', { name: 'Post job' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The budget should be an amount')
    expect(api.postJob).not.toHaveBeenCalled()
  })

  it('changes an open job, starting from what it says now', async () => {
    vi.mocked(api.jobWithQuotes).mockResolvedValue({
      job: makeJob({ id: 9, title: 'Old title', budgetMin: null, budgetMax: 1_250_050 }),
      quotes: [],
    })
    renderAs(makeUser(), <JobForm id={9} />)
    const title = await screen.findByLabelText('Title')
    expect(title).toHaveValue('Old title')
    expect(screen.getByLabelText(/Budget up to/)).toHaveValue('12500.50')
    await userEvent.clear(title)
    await userEvent.type(title, 'New title')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(api.saveJob).toHaveBeenCalledWith(9, expect.objectContaining({ title: 'New title', budgetMax: 1_250_050 }))
  })

  it("doesn't offer to change a job that's no longer open", async () => {
    vi.mocked(api.jobWithQuotes).mockResolvedValue({ job: makeJob({ id: 9, status: 'hired' }), quotes: [] })
    renderAs(makeUser(), <JobForm id={9} />)
    expect(await screen.findByText(/Only jobs that are still taking quotes can be changed/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })
})
