import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { LanguagePicker } from '../components/LanguagePicker'
import { Logo } from '../components/Logo'
import { FormError, Loading } from '../components/ui'
import { fill, useT } from '../i18n'
import type { InvitePreview, User } from '../types'
import { AuthScreen } from './AuthScreen'

interface Props {
  token: string
  /** null when logged out. */
  user: User | null
  onAuthenticated: (user: User) => void
  /** The proposal is in the client's account now: show it. */
  onClaimed: (projectId: number) => void
  onLeave: () => void
  onLogout: () => void
}

/**
 * The page a proposal email links to. It says who sent what, lets the client sign up (or log in),
 * and then adds the proposal to their account.
 */
export function InviteScreen({ token, user, onAuthenticated, onClaimed, onLeave, onLogout }: Props) {
  const t = useT()
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const claimed = useRef(false)

  useEffect(() => {
    api.previewInvite(token).then(setInvite, (err: Error) => setLoadError(err.message))
  }, [token])

  // Once a client is logged in, the proposal goes straight into their account.
  useEffect(() => {
    if (!invite || user?.role !== 'client' || claimed.current) return
    claimed.current = true
    api.claimInvite(token).then(onClaimed, (err: Error) => setClaimError(err.message))
  }, [invite, user, token, onClaimed])

  let body
  if (loadError) {
    body = (
      <div className="invite-card">
        <h1 className="invite-card__title">{t.invite.broken}</h1>
        <p>{loadError}</p>
        <button type="button" className="button button--primary" onClick={onLeave}>
          {t.invite.goToCasaFida}
        </button>
      </div>
    )
  } else if (!invite) {
    body = <Loading />
  } else {
    const intro = (
      <div className="invite-card">
        <p className="eyebrow">{t.invite.eyebrow}</p>
        <h1 className="invite-card__title">{invite.title}</h1>
        <p>
          {fill(t.invite.sentYou, {
            from: (
              <>
                <strong>{invite.businessName}</strong>
                {invite.builderName !== invite.businessName && ` (${invite.builderName})`}
              </>
            ),
          })}
          {user ? '' : ` ${t.invite.signUpToSee}`}
        </p>
      </div>
    )
    let action
    if (!user) {
      action = <AuthScreen invite={invite} onAuthenticated={onAuthenticated} />
    } else if (user.role === 'builder') {
      action = (
        <div className="invite-card">
          <p>{t.invite.loggedInAsBuilder(user.email)}</p>
          <div className="form-actions form-actions--start">
            <button type="button" className="button button--primary" onClick={onLogout}>
              {t.common.logOut}
            </button>
            <button type="button" className="button button--secondary" onClick={onLeave}>
              {t.invite.goToMyAccount}
            </button>
          </div>
        </div>
      )
    } else if (claimError) {
      action = (
        <div className="invite-card">
          <FormError error={claimError} />
          <button type="button" className="button button--secondary" onClick={onLeave}>
            {t.invite.goToCasaFida}
          </button>
        </div>
      )
    } else {
      action = <Loading />
    }
    body = (
      <>
        {intro}
        {action}
      </>
    )
  }

  return (
    <div className="invite">
      <header className="invite__header">
        <Logo />
        <LanguagePicker />
      </header>
      <main className="invite__main">{body}</main>
    </div>
  )
}
