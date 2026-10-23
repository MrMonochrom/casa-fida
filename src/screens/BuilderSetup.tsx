import { BuilderProfileForm } from '../components/BuilderProfileForm'
import { LanguagePicker } from '../components/LanguagePicker'
import { Logo } from '../components/Logo'
import { useT } from '../i18n'
import type { User } from '../types'

interface Props {
  user: User
  onDone: (user: User) => void
  onLogout: () => void
}

/** A new builder's first step: the business profile clients see before hiring them. */
export function BuilderSetup({ user, onDone, onLogout }: Props) {
  const t = useT()
  return (
    <div className="setup">
      <header className="setup__header">
        <Logo />
        <div className="setup__tools">
          <LanguagePicker />
          <button type="button" className="button button--ghost" onClick={onLogout}>
            {t.common.logOut}
          </button>
        </div>
      </header>
      <main className="setup__main">
        <p className="eyebrow">{t.setup.step}</p>
        <h1 className="page-title">{t.setup.title}</h1>
        <p className="page-subtitle">{t.setup.subtitle}</p>
        <div className="card">
          <BuilderProfileForm user={user} onSaved={onDone} submitLabel={t.setup.saveAndContinue} />
        </div>
      </main>
    </div>
  )
}
