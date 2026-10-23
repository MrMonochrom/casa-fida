import { useEffect, useState } from 'react'
import { api } from '../api'
import { fill, useT } from '../i18n'
import { useSession } from '../session'

/** Asks someone who hasn't confirmed their email address yet to do so, and can send the link again. */
export function VerifyEmailBanner() {
  const t = useT()
  const { user, onUserChange } = useSession()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // People confirm in another tab, from their email. Coming back here, check whether they have.
  useEffect(() => {
    function check() {
      api.me().then((fresh) => fresh?.emailVerified && onUserChange(fresh), () => {})
    }
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [onUserChange])

  async function resend() {
    setSending(true)
    setError(null)
    try {
      await api.resendVerification()
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="banner banner--info verify-banner">
      <p>
        {fill(user.role === 'builder' ? t.verify.bannerBuilder : t.verify.bannerClient, {
          email: <strong>{user.email}</strong>,
        })}
      </p>
      {sent ? (
        <p className="muted" role="status">
          {t.verify.sent}
        </p>
      ) : (
        <button type="button" className="button button--secondary button--small" onClick={resend} disabled={sending}>
          {t.verify.sendAgain}
        </button>
      )}
      {error && (
        <span className="inline-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
