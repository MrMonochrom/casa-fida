import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { FakeEventSource } from '../test/fakeEventSource'
import { makeConversation, makeMessage, makeUser } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { renderAs } from '../test/render'
import { Messages } from './Messages'

vi.mock('../api')

const marcus = makeConversation({
  id: 1,
  lastMessage: { text: 'Thursday at 9?', fromMe: false, sentAt: Date.now() },
  unread: 2,
})
const priya = makeConversation({
  id: 2,
  other: { id: 3, name: 'Priya Shah', role: 'builder', businessName: 'Shah Kitchen & Bath' },
  lastMessage: { text: 'Thanks!', fromMe: true, sentAt: Date.now() },
})

beforeEach(() => {
  resetApiMocks()
  vi.mocked(api.conversations).mockResolvedValue([marcus, priya])
  vi.mocked(api.messages).mockImplementation(async (id, after) => ({
    conversation: { ...(id === 1 ? marcus : priya), unread: 0 },
    messages:
      after === 0
        ? [makeMessage({ id: 10, text: 'Hi Marcus', fromMe: true }), makeMessage({ id: 11, text: 'Thursday at 9?' })]
        : [],
    seenUpTo: 10,
  }))
})

describe('Messages', () => {
  it('lists conversations by business, with what was said last', async () => {
    renderAs(makeUser(), <Messages id={null} />)
    const list = await screen.findByRole('list')
    expect(within(list).getAllByRole('link').map((l) => l.textContent)).toEqual([
      expect.stringContaining('Reid & Sons Construction'),
      expect.stringContaining('Shah Kitchen & Bath'),
    ])
    expect(screen.getByText('You: Thanks!')).toBeInTheDocument()
    expect(screen.getByLabelText('2 unread')).toBeInTheDocument()
    expect(screen.getByText('Choose a conversation.')).toBeInTheDocument()
  })

  it('shows a conversation, and refreshes the counts after reading it', async () => {
    const { session } = renderAs(makeUser(), <Messages id={1} />)
    expect(await screen.findByText('Thursday at 9?', { selector: '.bubble' })).toBeInTheDocument()
    expect(screen.getByText('Seen')).toBeInTheDocument()
    expect(api.messages).toHaveBeenCalledWith(1, 0)
    await waitFor(() => expect(session.refreshSummary).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/builders/2')
  })

  it('sends with the button or Enter, and Shift+Enter starts a new line', async () => {
    renderAs(makeUser(), <Messages id={1} />)
    const box = await screen.findByLabelText('Message')
    await userEvent.type(box, 'See you then')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(api.sendMessage).toHaveBeenCalledWith(1, 'See you then')
    expect(await screen.findByText('See you then', { selector: '.bubble' })).toBeInTheDocument()
    expect(box).toHaveValue('')

    await userEvent.type(box, 'Line one{Shift>}{Enter}{/Shift}line two{Enter}')
    expect(api.sendMessage).toHaveBeenLastCalledWith(1, 'Line one\nline two')
  })

  it('keeps what was typed if sending fails', async () => {
    vi.mocked(api.sendMessage).mockRejectedValue(new Error('Messages can be up to 2,000 characters.'))
    renderAs(makeUser(), <Messages id={1} />)
    const box = await screen.findByLabelText('Message')
    await userEvent.type(box, 'Hello{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('up to 2,000 characters')
    expect(box).toHaveValue('Hello')
  })

  it('fetches only newer messages when a live update arrives', async () => {
    renderAs(makeUser(), <Messages id={1} />)
    await screen.findByText('Thursday at 9?', { selector: '.bubble' })
    vi.mocked(api.messages).mockResolvedValueOnce({
      conversation: marcus,
      messages: [makeMessage({ id: 12, text: 'Bring the plans' })],
      seenUpTo: 10,
    })
    act(() => FakeEventSource.open!.emit('message', { type: 'message', conversationId: 1 }))
    expect(await screen.findByText('Bring the plans', { selector: '.bubble' })).toBeInTheDocument()
    expect(api.messages).toHaveBeenLastCalledWith(1, 11)
  })

  it('suggests where to start when there are no conversations', async () => {
    vi.mocked(api.conversations).mockResolvedValue([])
    renderAs(makeUser(), <Messages id={null} />)
    expect(await screen.findByText('No conversations yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find a builder' })).toHaveAttribute('href', '/builders')
  })
})
