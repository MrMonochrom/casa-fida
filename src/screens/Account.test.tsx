import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { makeBuilderUser, makeUser } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { renderAs } from '../test/render'
import { Account } from './Account'

vi.mock('../api')

beforeEach(resetApiMocks)

describe('Account', () => {
  it('saves your name and phone', async () => {
    const { session } = renderAs(makeUser(), <Account />)
    await userEvent.type(screen.getByLabelText(/Phone/), '(303) 555-0123')
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }))
    expect(api.saveAccount).toHaveBeenCalledWith('Emma Clarke', '(303) 555-0123')
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(session.onUserChange).toHaveBeenCalledWith(expect.objectContaining({ phone: '(303) 555-0123' }))
  })

  it('changes the password', async () => {
    renderAs(makeUser(), <Account />)
    await userEvent.type(screen.getByLabelText('Current password'), 'old-password')
    await userEvent.type(screen.getByLabelText('New password'), 'new-password')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(api.changePassword).toHaveBeenCalledWith('old-password', 'new-password')
    expect(await screen.findByText('Password changed.')).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveValue('')
  })

  it('shows why a password change failed', async () => {
    vi.mocked(api.changePassword).mockRejectedValue(new Error('Your current password is wrong.'))
    renderAs(makeUser(), <Account />)
    await userEvent.type(screen.getByLabelText('Current password'), 'nope')
    await userEvent.type(screen.getByLabelText('New password'), 'new-password')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password is wrong.')
  })

  it("lets a builder edit their business profile, starting from what's saved", async () => {
    renderAs(makeBuilderUser(), <Account />)
    expect(screen.getByLabelText('Business name')).toHaveValue('Reid & Sons Construction')
    expect(screen.getByRole('button', { name: 'Extensions' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Extensions' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(api.saveBuilderProfile).toHaveBeenCalledWith(expect.objectContaining({ trades: ['renovations'] }))
    expect(screen.getByRole('link', { name: 'See it as clients do' })).toHaveAttribute('href', '/builders/2')
  })

  it("doesn't show clients a business profile", () => {
    renderAs(makeUser(), <Account />)
    expect(screen.queryByLabelText('Business name')).not.toBeInTheDocument()
  })
})
