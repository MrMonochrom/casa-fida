import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { Icon } from './components/Icon'
import { LanguagePicker } from './components/LanguagePicker'
import type { IconName } from './components/Icon'
import { Logo } from './components/Logo'
import { CountBadge, Empty } from './components/ui'
import { Link } from './components/Link'
import { useT } from './i18n'
import type { Messages as Words } from './i18n'
import { idParam, matchPath, usePath } from './router'
import { Account } from './screens/Account'
import { BuilderJob } from './screens/BuilderJob'
import { BuilderPage } from './screens/BuilderPage'
import { ClientJob } from './screens/ClientJob'
import { FindBuilders } from './screens/FindBuilders'
import { FindWork } from './screens/FindWork'
import { Home } from './screens/Home'
import { JobForm } from './screens/JobForm'
import { Messages } from './screens/Messages'
import { MyJobs } from './screens/MyJobs'
import { ProjectPage } from './screens/project/ProjectPage'
import { Projects } from './screens/Projects'
import { ProposalForm } from './screens/ProposalForm'
import { useServerEvents } from './serverEvents'
import { SessionContext } from './session'
import type { Session } from './session'
import type { Summary, User } from './types'

// Live updates refresh the menu counts as things happen. This slower refresh is a backup.
const SUMMARY_REFRESH_MS = 60_000

interface Props {
  user: User
  onUserChange: (user: User) => void
  onLogout: () => void
}

interface NavItem {
  to: string
  label: string
  /** For the narrow menu bar on phones, if the label doesn't fit. */
  shortLabel?: string
  icon: IconName
  count?: number
  /** What the count means, for screen readers: "3 unread messages". */
  countLabel?: (count: number) => string
}

function navFor(user: User, summary: Summary | null, t: Words): NavItem[] {
  const nav = t.nav
  // A short label only where the full one differs, so screen readers aren't given both.
  const item = (to: string, label: string, short: string, icon: IconName, more: Partial<NavItem> = {}): NavItem => ({
    to,
    label,
    shortLabel: short !== label ? short : undefined,
    icon,
    ...more,
  })
  const messages = item('/messages', nav.messages, nav.short.messages, 'chat', {
    count: summary?.unreadMessages,
    countLabel: nav.unreadMessages,
  })
  const account = item('/account', nav.account, nav.short.account, 'user')
  if (user.role === 'client') {
    return [
      item('/', nav.home, nav.short.home, 'home'),
      item('/builders', nav.findBuilders, nav.short.builders, 'search'),
      item('/jobs', nav.myJobs, nav.short.myJobs, 'briefcase', { count: summary?.jobs, countLabel: nav.quotesToAnswer }),
      item('/projects', nav.projects, nav.short.projects, 'folder', {
        count: summary?.projects,
        countLabel: nav.thingsWaiting,
      }),
      messages,
      account,
    ]
  }
  return [
    item('/', nav.home, nav.short.home, 'home'),
    item('/jobs', t.common.findWork, nav.short.findWork, 'briefcase', { count: summary?.jobs, countLabel: nav.newJobs }),
    item('/projects', nav.projects, nav.short.projects, 'folder'),
    messages,
    account,
  ]
}

const isActive = (item: NavItem, path: string) =>
  item.to === '/'
    ? path === '/'
    : path === item.to || path.startsWith(`${item.to}/`) || (item.to === '/jobs' && path === '/quotes')

/** The page for the current address. */
function Screen({ path, user }: { path: string; user: User }) {
  const t = useT()
  const client = user.role === 'client'
  let m: Record<string, string> | null

  if (path === '/') return <Home />
  if (path === '/builders') return <FindBuilders />
  if ((m = matchPath('/builders/:id', path))) return <BuilderPage key={m.id} id={idParam(m.id)} />

  if (path === '/jobs') return client ? <MyJobs /> : <FindWork tab="jobs" />
  if (path === '/quotes' && !client) return <FindWork tab="quotes" />
  if (path === '/jobs/new' && client) return <JobForm />
  if ((m = matchPath('/jobs/:id/edit', path)) && client) return <JobForm key={m.id} id={idParam(m.id)} />
  if ((m = matchPath('/jobs/:id', path))) {
    return client ? <ClientJob key={m.id} id={idParam(m.id)} /> : <BuilderJob key={m.id} id={idParam(m.id)} />
  }

  if (path === '/projects') return <Projects />
  if (path === '/projects/new' && !client) return <ProposalForm />
  if ((m = matchPath('/projects/:id', path))) return <ProjectPage key={m.id} id={idParam(m.id)} />

  if (path === '/messages') return <Messages id={null} />
  if ((m = matchPath('/messages/:id', path))) return <Messages id={idParam(m.id)} />

  if (path === '/account') return <Account />

  return (
    <Empty title={t.nav.nothingHere}>
      <Link to="/" className="button button--secondary">
        {t.nav.goHome}
      </Link>
    </Empty>
  )
}

/** The logged-in app: the menu, and the page for the current address. */
export default function App({ user, onUserChange, onLogout }: Props) {
  const t = useT()
  const path = usePath()
  const [summary, setSummary] = useState<Summary | null>(null)

  const refreshSummary = useCallback(() => {
    api.summary().then(setSummary, () => {})
  }, [])

  useEffect(() => {
    refreshSummary()
    const timer = setInterval(refreshSummary, SUMMARY_REFRESH_MS)
    return () => clearInterval(timer)
  }, [refreshSummary])

  // Opening a page (like a conversation) can change the counts.
  useEffect(() => {
    refreshSummary()
  }, [path, refreshSummary])

  useServerEvents(() => refreshSummary())

  const session = useMemo<Session>(
    () => ({ user, onUserChange, onLogout, refreshSummary }),
    [user, onUserChange, onLogout, refreshSummary],
  )
  const items = navFor(user, summary, t)

  return (
    <SessionContext.Provider value={session}>
      <div className="app">
        <header className="topbar">
          <div className="topbar__inner">
            <Link to="/" className="topbar__logo" aria-label={t.nav.logoHome}>
              <Logo small />
            </Link>
            <nav className="nav" aria-label={t.nav.main}>
              {items.map((item) => {
                const active = isActive(item, path)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`nav__item ${active ? 'nav__item--active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon name={item.icon} />
                    {item.shortLabel ? (
                      <>
                        <span className="nav__label nav__label--long">{item.label}</span>
                        <span className="nav__label nav__label--short" aria-hidden="true">
                          {item.shortLabel}
                        </span>
                      </>
                    ) : (
                      <span className="nav__label">{item.label}</span>
                    )}
                    {item.count ? <CountBadge count={item.count} label={item.countLabel?.(item.count) ?? ''} /> : null}
                  </Link>
                )
              })}
            </nav>
            <LanguagePicker compact className="topbar__language" />
          </div>
        </header>
        <main className="main">
          <Screen path={path} user={user} />
        </main>
      </div>
    </SessionContext.Provider>
  )
}
