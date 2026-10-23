import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Root } from './Root'
import { api, setUnauthorizedHandler } from './api'
import { deferred, makeBuilderUser, makeProject, makeUser } from './test/fixtures'
import { resetApiMocks } from './test/mockApi'
import { visit } from './test/render'
import type { User } from './types'

vi.mock('./api')

beforeEach(() => {
  resetApiMocks()
  vi.mocked(setUnauthorizedHandler).mockReset()
})

const showsLogin = () => screen.findByRole('heading', { name: 'Log in' })
const showsApp = () => screen.findByRole('navigation', { name: 'Main' })

describe('Root', () => {
  it('shows the logo while checking for a session', async () => {
    const checking = deferred<User | null>()
    vi.mocked(api.me).mockReturnValue(checking.promise)
    render(<Root />)
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
    await act(async () => checking.resolve(null))
    expect(screen.queryByLabelText('Loading')).not.toBeInTheDocument()
  })

  it('shows log in, with what BuildBridge is, when logged out', async () => {
    render(<Root />)
    expect(await showsLogin()).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Builders and their clients/ })).toBeInTheDocument()
  })

  it('shows log in when the session check fails', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('offline'))
    render(<Root />)
    expect(await showsLogin()).toBeInTheDocument()
  })

  it('goes from logging in to the app, on the page that was asked for', async () => {
    visit('/projects/12')
    render(<Root />)
    await showsLogin()
    await userEvent.type(screen.getByLabelText('Email'), 'emma@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(api.login).toHaveBeenCalledWith('emma@example.com', 'secret-pass')
    await showsApp()
    expect(api.project).toHaveBeenCalledWith(12)
  })

  it('shows why logging in failed', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('Wrong email or password.'))
    render(<Root />)
    await showsLogin()
    await userEvent.type(screen.getByLabelText('Email'), 'emma@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
  })

  it('asks a new account whether they need work done or are a builder', async () => {
    render(<Root />)
    await showsLogin()
    await userEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    await userEvent.type(screen.getByLabelText('Your name'), 'Emma Clarke')
    await userEvent.type(screen.getByLabelText('Email'), 'emma@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose whether you need work done')
    expect(api.signup).not.toHaveBeenCalled()

    await userEvent.click(screen.getByLabelText(/I need work done/))
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(api.signup).toHaveBeenCalledWith({
      name: 'Emma Clarke',
      email: 'emma@example.com',
      password: 'secret-pass',
      role: 'client',
    })
    expect(await showsApp()).toBeInTheDocument()
  })

  it('takes a new builder through their business profile before the app', async () => {
    render(<Root />)
    await showsLogin()
    await userEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    await userEvent.click(screen.getByLabelText(/I'm a builder/))
    await userEvent.type(screen.getByLabelText('Your name'), 'Marcus Reid')
    await userEvent.type(screen.getByLabelText('Email'), 'marcus@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Set up your business profile' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Business name'), 'Reid & Sons')
    await userEvent.type(screen.getByLabelText('About your business'), 'We build things properly.')
    await userEvent.type(screen.getByLabelText('Area you work in'), 'Denver, CO')
    await userEvent.type(screen.getByLabelText(/Years in business/), '18')
    await userEvent.click(screen.getByRole('button', { name: 'Extensions' }))
    await userEvent.click(screen.getByRole('button', { name: 'Kitchens' }))
    await userEvent.click(screen.getByLabelText('We carry liability insurance'))
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))

    expect(api.saveBuilderProfile).toHaveBeenCalledWith({
      businessName: 'Reid & Sons',
      headline: '',
      about: 'We build things properly.',
      serviceArea: 'Denver, CO',
      yearsInBusiness: 18,
      licenseNumber: null,
      insured: true,
      trades: ['extensions', 'kitchens'],
    })
    const nav = await showsApp()
    expect(within(nav).getByRole('link', { name: 'Find work' })).toBeInTheDocument()
  })

  it('sends a builder without a business profile to set one up', async () => {
    vi.mocked(api.me).mockResolvedValue(makeBuilderUser({ builderProfile: null }))
    render(<Root />)
    expect(await screen.findByRole('heading', { name: 'Set up your business profile' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(api.logout).toHaveBeenCalled()
    expect(await showsLogin()).toBeInTheDocument()
  })

  it('goes back to log in when the server says the session is gone', async () => {
    vi.mocked(api.me).mockResolvedValue(makeUser())
    render(<Root />)
    await showsApp()
    const lostSession = vi.mocked(setUnauthorizedHandler).mock.calls[0][0]!
    act(() => lostSession())
    expect(await showsLogin()).toBeInTheDocument()
  })

  it('logs out from the account page', async () => {
    vi.mocked(api.me).mockResolvedValue(makeUser())
    visit('/account')
    render(<Root />)
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(api.logout).toHaveBeenCalled()
    expect(await showsLogin()).toBeInTheDocument()
  })
})

describe('invite links', () => {
  it('lets a new client sign up from a proposal email, then shows the proposal', async () => {
    vi.mocked(api.project).mockResolvedValue(makeProject({ id: 42, status: 'proposed', title: 'Kitchen remodel' }))
    visit('/invite?token=abc123')
    render(<Root />)

    expect(await screen.findByRole('heading', { name: 'Kitchen remodel' })).toBeInTheDocument()
    expect(screen.getByText(/Shah Kitchen & Bath/)).toBeInTheDocument()
    expect(api.previewInvite).toHaveBeenCalledWith('abc123')
    // The builder's details for the client are filled in, and the account is a client one.
    expect(screen.getByLabelText('Your name')).toHaveValue('David Nguyen')
    expect(screen.getByLabelText('Email')).toHaveValue('david@example.com')
    expect(screen.queryByText("I'm a builder")).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(api.signup).toHaveBeenCalledWith(expect.objectContaining({ role: 'client', email: 'david@example.com' }))
    await waitFor(() => expect(api.claimInvite).toHaveBeenCalledWith('abc123'))
    await waitFor(() => expect(window.location.pathname).toBe('/projects/42'))
    expect(await screen.findByRole('button', { name: 'Accept proposal' })).toBeInTheDocument()
  })

  it('adds the proposal straight away for a logged-in client', async () => {
    vi.mocked(api.me).mockResolvedValue(makeUser())
    visit('/invite?token=abc123')
    render(<Root />)
    await waitFor(() => expect(window.location.pathname).toBe('/projects/42'))
    expect(api.claimInvite).toHaveBeenCalledTimes(1)
  })

  it('tells a logged-in builder that proposals are for client accounts', async () => {
    vi.mocked(api.me).mockResolvedValue(makeBuilderUser())
    visit('/invite?token=abc123')
    render(<Root />)
    expect(await screen.findByText(/Proposals are for client accounts/)).toBeInTheDocument()
    expect(api.claimInvite).not.toHaveBeenCalled()
  })

  it('explains a link that no longer works', async () => {
    vi.mocked(api.previewInvite).mockRejectedValue(new Error('This invite link has expired or was already used.'))
    visit('/invite?token=old')
    render(<Root />)
    expect(await screen.findByText(/has expired or was already used/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Go to BuildBridge' }))
    expect(window.location.pathname).toBe('/')
    expect(await showsLogin()).toBeInTheDocument()
  })
})
