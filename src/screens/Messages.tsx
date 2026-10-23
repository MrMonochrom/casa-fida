import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { MESSAGE_MAX } from '../../shared/rules'
import { api } from '../api'
import { Avatar, Empty, FormError, Loading } from '../components/ui'
import { dayText, differentDays, timeText } from '../format'
import { Link } from '../components/Link'
import { useServerEvents } from '../serverEvents'
import { useSession } from '../session'
import type { Conversation, Message } from '../types'
import { useResource } from '../useResource'

// Live updates bring new messages straight away. This slower check is a backup in case they can't get through.
const POLL_MS = 15_000

/** How someone is shown in Messages: a builder by their business, a client by their name. */
function displayName(other: Conversation['other']) {
  return other.businessName ?? other.name
}

/** Your conversations, and the one that's open (if any). */
export function Messages({ id }: { id: number | null }) {
  const { user } = useSession()
  const { data: conversations, error, reload } = useResource(() => api.conversations(), 'conversations')

  useServerEvents((event) => {
    if (event.type === 'message') reload()
  })

  const open = conversations?.find((c) => c.id === id)

  return (
    <div className={`messages ${id ? 'messages--open' : ''}`}>
      <aside className="messages__list" aria-label="Conversations">
        <h1 className="page-title messages__title">Messages</h1>
        {!conversations ? (
          <Loading error={error} onRetry={reload} />
        ) : conversations.length === 0 ? (
          <Empty title="No conversations yet.">
            <p className="muted">
              {user.role === 'client' ? (
                <>
                  <Link to="/builders" className="text-link">
                    Find a builder
                  </Link>{' '}
                  and message them, or post a job and talk to the builders who quote.
                </>
              ) : (
                'Clients can message you from your profile. You can message clients once you’ve quoted for them.'
              )}
            </p>
          </Empty>
        ) : (
          <ul className="conversations">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/messages/${c.id}`}
                  className={`conversation ${c.id === id ? 'conversation--active' : ''}`}
                  aria-current={c.id === id ? 'page' : undefined}
                >
                  <Avatar name={displayName(c.other)} size="small" />
                  <span className="conversation__text">
                    <span className="conversation__top">
                      <strong>{displayName(c.other)}</strong>
                      {c.lastMessage && <span className="muted small">{dayOrTime(c.lastMessage.sentAt)}</span>}
                    </span>
                    <span className={`conversation__preview ${c.unread ? 'conversation__preview--unread' : ''}`}>
                      {c.lastMessage ? `${c.lastMessage.fromMe ? 'You: ' : ''}${c.lastMessage.text}` : 'No messages yet'}
                    </span>
                  </span>
                  {c.unread > 0 && (
                    <span className="count" aria-label={`${c.unread} unread`}>
                      {c.unread}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <section className="messages__chat">
        {id === null ? (
          <div className="messages__placeholder">
            <p className="muted">Choose a conversation.</p>
          </div>
        ) : (
          <Chat key={id} conversationId={id} known={open} onActivity={reload} />
        )}
      </section>
    </div>
  )
}

/** "2:05 PM" today, otherwise "Yesterday" or a short date. */
function dayOrTime(ms: number) {
  const day = dayText(ms)
  return day === 'Today' ? timeText(ms) : day
}

interface ChatProps {
  conversationId: number
  /** The conversation from the list, shown while its messages load. */
  known?: Conversation
  /** Something changed that the conversation list shows (a message sent or read). */
  onActivity: () => void
}

function Chat({ conversationId, known, onActivity }: ChatProps) {
  const { refreshSummary } = useSession()
  const [conversation, setConversation] = useState<Conversation | null>(known ?? null)
  // null until the conversation has loaded.
  const [messages, setMessages] = useState<Message[] | null>(null)
  // The newest of your messages they've read.
  const [seenUpTo, setSeenUpTo] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // The newest message fetched from the server. Each check asks only for messages after it.
  const lastFetchedId = useRef(0)
  const checkNow = useRef<() => void>(() => {})
  const bottom = useRef<HTMLDivElement>(null)
  const latestOnActivity = useRef(onActivity)

  useEffect(() => {
    latestOnActivity.current = onActivity
  })

  /** Adds messages to the conversation in order, skipping ones already shown. */
  const showMessages = useCallback((incoming: Message[]) => {
    setMessages((current) => {
      const known = new Set((current ?? []).map((m) => m.id))
      const fresh = incoming.filter((m) => !known.has(m.id))
      if (current && fresh.length === 0) return current
      return [...(current ?? []), ...fresh].sort((a, b) => a.id - b.id)
    })
  }, [])

  // Load the conversation, then keep checking for new messages.
  useEffect(() => {
    let stopped = false
    async function poll() {
      try {
        const result = await api.messages(conversationId, lastFetchedId.current)
        if (stopped) return
        setConversation(result.conversation)
        showMessages(result.messages)
        const hadUnread = result.messages.some((m) => !m.fromMe)
        for (const m of result.messages) lastFetchedId.current = Math.max(lastFetchedId.current, m.id)
        setSeenUpTo(result.seenUpTo)
        setLoadError(null)
        // Reading messages changes the unread counts.
        if (hadUnread) {
          refreshSummary()
          latestOnActivity.current()
        }
      } catch (err) {
        if (!stopped) setLoadError((err as Error).message)
      }
    }
    checkNow.current = poll
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
      checkNow.current = () => {}
    }
  }, [conversationId, showMessages, refreshSummary])

  useServerEvents((event) => {
    if ((event.type === 'message' || event.type === 'read') && event.conversationId === conversationId) {
      checkNow.current()
    }
  })

  // Keep the newest message in view.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      // Shown straight away, but it doesn't move lastFetchedId: a message they sent just before
      // yours has a lower id, and the next check still has to fetch it.
      showMessages([await api.sendMessage(conversationId, text)])
      setDraft('')
      setError(null)
      latestOnActivity.current()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  // Enter sends; Shift+Enter starts a new line.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  if (!conversation && loadError) return <Loading error={loadError} />

  const lastMineId = messages?.findLast((m) => m.fromMe)?.id
  const other = conversation?.other

  return (
    <div className="chat">
      <header className="chat__header">
        <Link to="/messages" className="chat__back" aria-label="Back to conversations">
          ‹
        </Link>
        {other && (
          <>
            <Avatar name={displayName(other)} size="small" />
            <div className="chat__who">
              <strong>{displayName(other)}</strong>
              {other.businessName && <span className="muted small">{other.name}</span>}
            </div>
            {other.role === 'builder' && (
              <Link to={`/builders/${other.id}`} className="text-link chat__profile">
                Profile
              </Link>
            )}
          </>
        )}
      </header>

      <div className="chat__messages" aria-live="polite">
        {messages === null && !loadError && <p className="chat__intro">Loading…</p>}
        {messages?.length === 0 && other && <p className="chat__intro">Say hello to {other.name.split(' ')[0]}.</p>}
        {messages?.map((m, i) => (
          <Fragment key={m.id}>
            {(i === 0 || differentDays(messages[i - 1].sentAt, m.sentAt)) && (
              <p className="chat__day">{dayText(m.sentAt)}</p>
            )}
            <p className={`bubble bubble--${m.fromMe ? 'me' : 'them'}`} title={new Date(m.sentAt).toLocaleString()}>
              {m.text}
              <span className="bubble__time">{timeText(m.sentAt)}</span>
            </p>
            {m.id === lastMineId && seenUpTo !== null && seenUpTo >= m.id && <p className="chat__seen">Seen</p>}
          </Fragment>
        ))}
        <div ref={bottom} />
      </div>

      {loadError && conversation && <FormError error={loadError} />}
      <FormError error={error} />

      <form className="chat__composer" onSubmit={send}>
        <textarea
          className="input chat__input"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={other ? `Message ${other.name.split(' ')[0]}` : 'Message'}
          aria-label="Message"
          maxLength={MESSAGE_MAX}
        />
        <button className="button button--primary" type="submit" disabled={!draft.trim() || sending}>
          Send
        </button>
      </form>
    </div>
  )
}
