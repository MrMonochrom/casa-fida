import { useState } from 'react'
import { api } from '../api'
import { navigate } from '../router'

interface Props {
  /** The person to message. */
  userId: number
  label?: string
  className?: string
}

/** Opens the conversation with someone (starting it if needed) in Messages. */
export function MessageButton({ userId, label = 'Message', className = 'button button--secondary' }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open() {
    setBusy(true)
    setError(null)
    try {
      const conversation = await api.openConversation(userId)
      navigate(`/messages/${conversation.id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={open} disabled={busy}>
        {busy ? 'Opening…' : label}
      </button>
      {error && (
        <span className="inline-error" role="alert">
          {error}
        </span>
      )}
    </>
  )
}
