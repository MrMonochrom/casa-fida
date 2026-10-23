import { BuilderProfileForm } from '../components/BuilderProfileForm'
import { Logo } from '../components/Logo'
import type { User } from '../types'

interface Props {
  user: User
  onDone: (user: User) => void
  onLogout: () => void
}

/** A new builder's first step: the business profile clients see before hiring them. */
export function BuilderSetup({ user, onDone, onLogout }: Props) {
  return (
    <div className="setup">
      <header className="setup__header">
        <Logo />
        <button type="button" className="button button--ghost" onClick={onLogout}>
          Log out
        </button>
      </header>
      <main className="setup__main">
        <p className="eyebrow">Step 2 of 2</p>
        <h1 className="page-title">Set up your business profile</h1>
        <p className="page-subtitle">
          Clients see this when they search for builders and when you send them a quote or proposal. You can change
          it any time.
        </p>
        <div className="card">
          <BuilderProfileForm user={user} onSaved={onDone} submitLabel="Save and continue" />
        </div>
      </main>
    </div>
  )
}
