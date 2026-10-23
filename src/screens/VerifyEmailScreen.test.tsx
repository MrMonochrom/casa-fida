import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { Root } from '../Root'
import { api } from '../api'
import { makeBuilderUser, makeProject, makeUser } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { visit } from '../test/render'

vi.mock('../api')

beforeEach(resetApiMocks)

describe('the confirmation link', () => {
  it('confirms the address without logging in', async () => {
    vi.mocked(api.verifyEmail).mockResolvedValue('emma@example.com')
    visit('/verify-email?token=abc123')
    render(<Root />)
    expect(await screen.findByRole('heading', { name: 'Email address confirmed' })).toBeInTheDocument()
    expect(screen.getByText('emma@example.com is confirmed. Thanks!')).toBeInTheDocument()
    expect(api.verifyEmail).toHaveBeenCalledTimes(1)
    expect(api.verifyEmail).toHaveBeenCalledWith('abc123')

    await userEvent.click(screen.getByRole('button', { name: 'Go to Casa Fida' }))
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('takes the banner away for someone logged in', async () => {
    vi.mocked(api.me)
      .mockResolvedValueOnce(makeUser({ emailVerified: false }))
      .mockResolvedValue(makeUser({ emailVerified: true }))
    vi.mocked(api.verifyEmail).mockResolvedValue('emma@example.com')
    visit('/verify-email?token=abc123')
    render(<Root />)
    await userEvent.click(await screen.findByRole('button', { name: 'Go to Casa Fida' }))
    await screen.findByRole('navigation', { name: 'Main' })
    await waitFor(() => expect(screen.queryByText(/Confirm your email address/)).not.toBeInTheDocument())
  })

  it('says when the link no longer works', async () => {
    vi.mocked(api.verifyEmail).mockRejectedValue(
      new Error('This confirmation link has expired or was already used. Log in to get a new one.'),
    )
    visit('/verify-email?token=old')
    render(<Root />)
    expect(await screen.findByRole('heading', { name: "This link doesn't work any more" })).toBeInTheDocument()
    expect(screen.getByText(/expired or was already used/)).toBeInTheDocument()
  })
})

describe('the banner', () => {
  const renderApp = (user = makeUser({ emailVerified: false })) =>
    render(<App user={user} onUserChange={vi.fn()} onLogout={vi.fn()} />)

  it('asks a client to confirm, and sends the link again', async () => {
    renderApp()
    expect(screen.getByText(/so proposals from builders come straight into your account/)).toBeInTheDocument()
    expect(screen.getByText('emma@example.com').tagName).toBe('STRONG')
    await userEvent.click(screen.getByRole('button', { name: 'Send it again' }))
    expect(api.resendVerification).toHaveBeenCalled()
    expect(await screen.findByText('Sent. Check your inbox.')).toBeInTheDocument()
  })

  it('tells a builder they need it to send proposals', () => {
    renderApp(makeBuilderUser({ emailVerified: false }))
    expect(screen.getByText(/Confirm your email address to send proposals/)).toBeInTheDocument()
  })

  it("isn't there once the address is confirmed", () => {
    renderApp(makeUser())
    expect(screen.queryByText(/Confirm your email address/)).not.toBeInTheDocument()
  })
})

describe("a builder's proposal", () => {
  it("doesn't offer messaging until the client accepts", async () => {
    vi.mocked(api.project).mockResolvedValue(makeProject({ id: 4, status: 'proposed', myRole: 'builder' }))
    visit('/projects/4')
    render(<App user={makeBuilderUser()} onUserChange={vi.fn()} onLogout={vi.fn()} />)
    await screen.findByRole('button', { name: 'Edit details' })
    expect(screen.queryByRole('button', { name: 'Message' })).not.toBeInTheDocument()
  })
})
