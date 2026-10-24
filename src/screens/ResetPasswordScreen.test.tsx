import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Root } from '../Root'
import { ApiError, api } from '../api'
import { makeBuilderUser, makeUser } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { renderAs, visit } from '../test/render'
import { Account } from './Account'

// The calls are mocked; ApiError stays real, so the page can tell a dead link (404) from a bad password.
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, api: Object.fromEntries(Object.keys(actual.api).map((name) => [name, vi.fn()])) }
})

beforeEach(resetApiMocks)

describe('forgot password', () => {
  it('asks for the email and sends a reset link', async () => {
    render(<Root />)
    await userEvent.click(await screen.findByRole('button', { name: 'Forgot your password?' }))
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Email'), 'emma@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send link' }))
    expect(api.requestPasswordReset).toHaveBeenCalledWith('emma@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent(
      "If an account uses emma@example.com, we've sent it a link to choose a new password.",
    )
    await userEvent.click(screen.getByRole('button', { name: 'Back to log in' }))
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })
})

describe('the reset link', () => {
  it('sets the new password and opens the app, logged in', async () => {
    vi.mocked(api.resetPassword).mockResolvedValue(makeUser())
    visit('/reset-password?token=t0k3n')
    render(<Root />)
    await userEvent.type(await screen.findByLabelText('New password'), 'brand-new-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    expect(api.resetPassword).toHaveBeenCalledWith('t0k3n', 'brand-new-pass')
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('lets you fix a password the server refuses', async () => {
    vi.mocked(api.resetPassword).mockRejectedValue(new ApiError(400, 'Your password needs at least 8 characters.'))
    visit('/reset-password?token=t0k3n')
    render(<Root />)
    await userEvent.type(await screen.findByLabelText('New password'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your password needs at least 8 characters.')
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
  })

  it('offers a new link when this one no longer works', async () => {
    vi.mocked(api.resetPassword).mockRejectedValue(
      new ApiError(404, 'This password reset link has expired or was already used. Ask for a new one.'),
    )
    visit('/reset-password?token=old')
    render(<Root />)
    await userEvent.type(await screen.findByLabelText('New password'), 'brand-new-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    expect(await screen.findByRole('heading', { name: "This link doesn't work any more" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ask for a new link' }))
    expect(await screen.findByRole('button', { name: 'Forgot your password?' })).toBeInTheDocument()
  })
})

describe('email settings', () => {
  it('saves which emails a client gets', async () => {
    vi.mocked(api.saveEmailSettings).mockImplementation(async (notifications) => makeUser({ notifications }))
    const { session } = renderAs(makeUser(), <Account />)
    expect(screen.getByLabelText('New quotes on your jobs')).toBeChecked()
    await userEvent.click(screen.getByLabelText("New messages, when you're not in the app"))
    await userEvent.click(emailSettingsSaveButton())
    expect(api.saveEmailSettings).toHaveBeenCalledWith({ quotes: true, projects: true, messages: false, jobs: true })
    expect(session.onUserChange).toHaveBeenCalledWith(
      expect.objectContaining({ notifications: { quotes: true, projects: true, messages: false, jobs: true } }),
    )
  })

  it('work on a page opened before email settings existed', () => {
    const { notifications: _missing, ...openedBefore } = makeUser()
    renderAs(openedBefore as ReturnType<typeof makeUser>, <Account />)
    expect(screen.getByLabelText('New quotes on your jobs')).toBeChecked()
  })

  it('describes them for a builder', () => {
    renderAs(makeBuilderUser(), <Account />)
    expect(screen.getByLabelText('When a client accepts your quote')).toBeInTheDocument()
    expect(screen.getByLabelText('Answers to your proposals and change orders')).toBeInTheDocument()
  })
})

/** The Save button of the email settings, the last one on the page. */
function emailSettingsSaveButton() {
  const buttons = screen.getAllByRole('button', { name: 'Save' })
  return buttons[buttons.length - 1]
}
