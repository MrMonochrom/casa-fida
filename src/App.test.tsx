import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { api } from './api'
import { FakeEventSource } from './test/fakeEventSource'
import { makeBuilderUser, makeUser } from './test/fixtures'
import { resetApiMocks } from './test/mockApi'
import { visit } from './test/render'
import type { User } from './types'

vi.mock('./api')

beforeEach(resetApiMocks)

function renderApp(user: User = makeUser()) {
  return render(<App user={user} onUserChange={vi.fn()} onLogout={vi.fn()} />)
}

const menu = () => screen.getByRole('navigation', { name: 'Main' })
const menuLinks = () => within(menu()).getAllByRole('link').map((link) => link.getAttribute('href'))

describe('the menu', () => {
  it('has what a client needs', () => {
    renderApp()
    expect(menuLinks()).toEqual(['/', '/builders', '/jobs', '/projects', '/messages', '/account'])
    expect(within(menu()).getByRole('link', { name: /My jobs/ })).toBeInTheDocument()
  })

  it('has what a builder needs', () => {
    renderApp(makeBuilderUser())
    expect(menuLinks()).toEqual(['/', '/jobs', '/projects', '/messages', '/account'])
    expect(within(menu()).getByRole('link', { name: /Find work/ })).toBeInTheDocument()
  })

  it('marks the page you are on', async () => {
    visit('/projects/3')
    renderApp()
    expect(within(menu()).getByRole('link', { name: /Projects/ })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(menu()).getByRole('link', { name: /Messages/ }))
    expect(window.location.pathname).toBe('/messages')
    expect(within(menu()).getByRole('link', { name: /Messages/ })).toHaveAttribute('aria-current', 'page')
  })

  it('counts what is waiting, and updates live', async () => {
    vi.mocked(api.summary).mockResolvedValue({ unreadMessages: 3, projects: 2, jobs: 1 })
    renderApp()
    expect(await screen.findByLabelText('3 unread messages')).toHaveTextContent('3')
    expect(screen.getByLabelText('2 things waiting for you')).toBeInTheDocument()
    expect(screen.getByLabelText('1 quotes to answer')).toBeInTheDocument()

    vi.mocked(api.summary).mockResolvedValue({ unreadMessages: 4, projects: 2, jobs: 1 })
    act(() => FakeEventSource.open!.emit('message', { type: 'message', conversationId: 1 }))
    expect(await screen.findByLabelText('4 unread messages')).toBeInTheDocument()
  })
})

describe('pages', () => {
  it('shows each page at its address', async () => {
    visit('/builders')
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Find a builder' })).toBeInTheDocument()
  })

  it("keeps clients and builders on their own kind of job page", async () => {
    visit('/jobs')
    const { unmount } = renderApp()
    expect(await screen.findByRole('heading', { name: 'My jobs' })).toBeInTheDocument()
    unmount()

    visit('/jobs')
    renderApp(makeBuilderUser())
    expect(await screen.findByRole('heading', { name: 'Find work' })).toBeInTheDocument()
  })

  it("doesn't show builders the form for posting a job", async () => {
    visit('/jobs/new')
    renderApp(makeBuilderUser())
    expect(await screen.findByText("This job doesn't exist or isn't open any more.")).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Post a job' })).not.toBeInTheDocument()
    expect(api.jobForBuilder).not.toHaveBeenCalled()
  })

  it('says when there is nothing at an address', async () => {
    visit('/nowhere')
    renderApp()
    expect(screen.getByText("There's nothing at this address.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Go to the home page' }))
    expect(window.location.pathname).toBe('/')
  })
})
