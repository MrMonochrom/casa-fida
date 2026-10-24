import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Trade } from '../../shared/rules'
import { api } from '../api'
import { makeBuilderUser, makeUser } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { renderAs } from '../test/render'
import { Account } from './Account'

vi.mock('../api')

beforeEach(resetApiMocks)

const NOV_6 = new Date(2026, 10, 6).getTime()
const pro = (endsAt: number | null = NOV_6) =>
  makeBuilderUser({ plan: { name: 'pro', endsAt, trialAvailable: false } })

describe('the plan on Account', () => {
  it('shows a builder on Free what Pro adds, and starts the trial', async () => {
    vi.mocked(api.startTrial).mockResolvedValue(pro())
    const { session } = renderAs(makeBuilderUser(), <Account />)
    expect(screen.getByText("You're on the free plan.")).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByRole('row', { name: /Emails about new jobs/ })).toHaveTextContent('Once a dayAs each is posted')
    expect(within(table).getByRole('row', { name: /New quotes a day/ })).toHaveTextContent('30100')
    expect(within(table).getByRole('row', { name: /Trades you can offer/ })).toHaveTextContent('612')

    await userEvent.click(screen.getByRole('button', { name: 'Try Pro free for 14 days' }))
    expect(api.startTrial).toHaveBeenCalled()
    expect(session.onUserChange).toHaveBeenCalledWith(expect.objectContaining({ plan: expect.objectContaining({ name: 'pro' }) }))
  })

  it('says until when a builder has Pro, without offering the trial', () => {
    renderAs(pro(), <Account />)
    expect(screen.getByText("You're on Pro until Nov 6, 2026.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try Pro/ })).not.toBeInTheDocument()
  })

  it('says when Pro has no end date', () => {
    renderAs(pro(null), <Account />)
    expect(screen.getByText("You're on Pro.")).toBeInTheDocument()
  })

  it("doesn't offer the trial twice", () => {
    renderAs(makeBuilderUser({ plan: { name: 'free', endsAt: null, trialAvailable: false } }), <Account />)
    expect(screen.queryByRole('button', { name: /Try Pro/ })).not.toBeInTheDocument()
    expect(screen.getByText('Paying for Pro opens once online payments are set up.')).toBeInTheDocument()
  })

  it("isn't there for clients", () => {
    renderAs(makeUser(), <Account />)
    expect(screen.queryByRole('heading', { name: 'Your plan' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/New jobs in your trades/)).not.toBeInTheDocument()
  })

  it('lets a builder offer as many trades as the plan allows', () => {
    renderAs(pro(), <Account />)
    expect(screen.getByText('(up to 12)')).toBeInTheDocument()
  })

  it('names the trades that stopped counting when Pro ended, in the order they were chosen', () => {
    const trades: Trade[] = ['kitchens', 'bathrooms', 'roofing', 'painting', 'flooring', 'plumbing', 'electrical', 'carpentry']
    const builder = makeBuilderUser()
    renderAs(makeBuilderUser({ builderProfile: { ...builder.builderProfile!, trades } }), <Account />)
    expect(screen.getByText(/don't count for now/)).toHaveTextContent(
      "Your plan covers 6 trades, so these don't count for now: Electrical, Carpentry. Remove trades until you have 6 to save.",
    )
  })

  it('names how new-job emails come on each plan', () => {
    const { unmount } = renderAs(makeBuilderUser(), <Account />)
    expect(screen.getByLabelText('New jobs in your trades, once a day')).toBeChecked()
    unmount()
    renderAs(pro(), <Account />)
    expect(screen.getByLabelText('New jobs in your trades, as each is posted')).toBeChecked()
  })
})
