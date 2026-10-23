import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { makeBuilderUser, makeProject } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { renderAs } from '../test/render'
import { ProposalForm } from './ProposalForm'

vi.mock('../api')

beforeEach(resetApiMocks)

describe('ProposalForm', () => {
  it('sends a proposal with stages in the chosen order, and opens it', async () => {
    vi.mocked(api.propose).mockResolvedValue(makeProject({ id: 90, status: 'proposed', myRole: 'builder' }))
    renderAs(makeBuilderUser(), <ProposalForm />)

    await userEvent.type(screen.getByLabelText('Name'), 'David Nguyen')
    await userEvent.type(screen.getByLabelText('Email'), 'david@example.com')
    await userEvent.type(screen.getByLabelText('Title'), 'Kitchen remodel')
    await userEvent.type(screen.getByLabelText("What's included"), 'Cabinets and counters.')
    await userEvent.type(screen.getByLabelText('Price'), '46,800')
    await userEvent.type(screen.getByLabelText(/Start date/), '2026-11-13')

    await userEvent.click(screen.getByRole('button', { name: '+ Demolition' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Painting & finishes' }))
    await userEvent.type(screen.getByLabelText('Your own stage'), 'Cabinets & counters{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Move Cabinets & counters up' }))
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Demolition'),
      expect.stringContaining('Cabinets & counters'),
      expect.stringContaining('Painting & finishes'),
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Send proposal' }))
    expect(api.propose).toHaveBeenCalledWith({
      clientName: 'David Nguyen',
      clientEmail: 'david@example.com',
      title: 'Kitchen remodel',
      description: 'Cabinets and counters.',
      address: '',
      contractAmount: 4_680_000,
      startDate: '2026-11-13',
      stages: ['Demolition', 'Cabinets & counters', 'Painting & finishes'],
    })
    await waitFor(() => expect(window.location.pathname).toBe('/projects/90'))
  })

  it("explains a price it can't read", async () => {
    renderAs(makeBuilderUser(), <ProposalForm />)
    await userEvent.type(screen.getByLabelText('Price'), 'TBD')
    await userEvent.click(screen.getByRole('button', { name: 'Send proposal' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the price for the work')
    expect(api.propose).not.toHaveBeenCalled()
  })

  it('shows what the server says is wrong', async () => {
    vi.mocked(api.propose).mockRejectedValue(new Error('That email belongs to a builder account.'))
    renderAs(makeBuilderUser(), <ProposalForm />)
    await userEvent.type(screen.getByLabelText('Price'), '1000')
    await userEvent.click(screen.getByRole('button', { name: 'Send proposal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('belongs to a builder account')
  })
})
