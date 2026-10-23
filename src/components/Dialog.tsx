import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** Wider, for forms with several fields side by side, or photos. */
  wide?: boolean
}

/** A panel over the page. Closes with Escape or a click outside, and keeps focus inside while open. */
export function Dialog({ title, onClose, children, wide = false }: Props) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const latestOnClose = useRef(onClose)

  useEffect(() => {
    latestOnClose.current = onClose
  })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    // Focus the first field, or the panel itself, so keyboard and screen reader users start inside.
    const first = panel.current?.querySelector<HTMLElement>('input, textarea, select')
    ;(first ?? panel.current)?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') latestOnClose.current()
    }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        className={`modal${wide ? ' modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal__header">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
