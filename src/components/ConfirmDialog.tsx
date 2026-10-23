import { useState } from 'react'
import type { ReactNode } from 'react'
import { Dialog } from './Dialog'
import { FormError } from './ui'

interface Props {
  title: string
  message: ReactNode
  confirmLabel: string
  /** A red button, for things that can't be undone. */
  danger?: boolean
  /** Does the thing. If it fails, the error is shown and the dialog stays open. */
  onConfirm: () => Promise<void>
  onCancel: () => void
}

/** "Are you sure?" before accepting a quote, withdrawing a proposal, voiding an invoice… */
export function ConfirmDialog({ title, message, confirmLabel, danger = false, onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog title={title} onClose={onCancel}>
      <div className="modal__text">{message}</div>
      <FormError error={error} />
      <div className="form-actions">
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`button ${danger ? 'button--danger' : 'button--primary'}`}
          onClick={confirm}
          disabled={busy}
        >
          {busy ? 'One moment…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
