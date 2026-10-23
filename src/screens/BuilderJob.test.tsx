import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { makeBuilderUser, makeJob, makeQuote } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { renderAs } from '../test/render'
import type { Quote } from '../types'
import { BuilderJob } from './BuilderJob'

vi.mock('../api')

beforeEach(resetApiMocks)

const job = makeJob({ id: 8, client: { id: 1, name: 'Emma C.' } })

function renderJob(myQuote: Quote | null = null, overrides = {}) {
  vi.mocked(api.jobForBuilder).mockResolvedValue({ job: { ...job, ...overrides }, myQuote })
  return renderAs(makeBuilderUser(), <BuilderJob id={8} />)
}

describe('BuilderJob', () => {
  it('sends a quote, reading the price as typed', async () => {
    renderJob()
    await userEvent.type(await screen.findByLabelText('Your price'), '18,500.50')
    await userEvent.type(screen.getByLabelText(/How long it takes/), '6')
    await userEvent.type(screen.getByLabelText("What's included"), 'Tile, vanity and shower.')
    await userEvent.click(screen.getByRole('button', { name: 'Send quote' }))

    expect(api.sendQuote).toHaveBeenCalledWith(8, { amount: 1_850_050, currency: 'USD', weeks: 6, message: 'Tile, vanity and shower.' })
    expect(await screen.findByText('$18,500.50')).toBeInTheDocument()
    expect(screen.getByText('Waiting for an answer')).toBeInTheDocument()
  })

  it("explains a price it can't read, without sending", async () => {
    renderJob()
    await userEvent.type(await screen.findByLabelText('Your price'), 'about 18k')
    await userEvent.click(screen.getByRole('button', { name: 'Send quote' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your price')
    expect(api.sendQuote).not.toHaveBeenCalled()
  })

  it('shows the reason the server gives', async () => {
    vi.mocked(api.sendQuote).mockRejectedValue(new Error("Say what's included in your price."))
    renderJob()
    await userEvent.type(await screen.findByLabelText('Your price'), '18500')
    await userEvent.click(screen.getByRole('button', { name: 'Send quote' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Say what's included")
  })

  it('changes a quote that is waiting for an answer', async () => {
    renderJob(makeQuote({ jobId: 8, amount: 2_000_000, weeks: 4, message: 'Old.' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Change quote' }))
    const price = screen.getByLabelText('Your price')
    expect(price).toHaveValue('20000')
    await userEvent.clear(price)
    await userEvent.type(price, '19000')
    await userEvent.click(screen.getByRole('button', { name: 'Update quote' }))
    expect(api.sendQuote).toHaveBeenCalledWith(8, { amount: 1_900_000, currency: 'USD', weeks: 4, message: 'Old.' })
  })

  it('withdraws a quote', async () => {
    renderJob(makeQuote({ jobId: 8 }))
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Withdraw quote' }))
    expect(api.withdrawQuote).toHaveBeenCalledWith(8)
    await waitFor(() => expect(api.jobForBuilder).toHaveBeenCalledTimes(2))
  })

  it('celebrates an accepted quote and links to the project', async () => {
    renderJob(makeQuote({ jobId: 8, status: 'accepted', projectId: 31 }), { status: 'hired' })
    expect(await screen.findByText('You got the job!')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the project' })).toHaveAttribute('href', '/projects/31')
    expect(screen.queryByRole('button', { name: 'Change quote' })).not.toBeInTheDocument()
  })

  it('lets the builder message the client once they have quoted', async () => {
    renderJob(makeQuote({ jobId: 8 }))
    await userEvent.click(await screen.findByRole('button', { name: 'Message the client' }))
    expect(api.openConversation).toHaveBeenCalledWith(1)
  })

  it("doesn't offer messaging before quoting", async () => {
    renderJob()
    await screen.findByLabelText('Your price')
    expect(screen.queryByRole('button', { name: 'Message the client' })).not.toBeInTheDocument()
  })
})
