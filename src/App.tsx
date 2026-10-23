import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { Icon } from './components/Icon'
import type { IconName } from './components/Icon'
import { Logo } from './components/Logo'
import { CountBadge, Empty } from './components/ui'
import { Link } from './components/Link'
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
  countLabel?: string
}

function navFor(user: User, summary: Summary | null): NavItem[] {
  const messages: NavItem = {
    to: '/messages',
    label: 'Messages',
    icon: 'chat',
    count: summary?.unreadMessages,
    countLabel: 'unread messages',
  }
  if (user.role === 'client') {
    return [
      { to: '/', label: 'Home', icon: 'home' },
      { to: '/builders', label: 'Find builders', shortLabel: 'Builders', icon: 'search' },
      { to: '/jobs', label: 'My jobs', icon: 'briefcase', count: summary?.jobs, countLabel: 'quotes to answer' },
      {
        to: '/projects',
        label: 'Projects',
        icon: 'folder',
        count: summary?.projects,
        countLabel: 'things waiting for you',
      },
      messages,
      { to: '/account', label: 'Account', icon: 'user' },
    ]
  }
  return [
    { to: '/', label: 'Home', icon: 'home' },
    { to: '/jobs', label: 'Find work', icon: 'briefcase', count: summary?.jobs, countLabel: 'new jobs in your trades' },
    { to: '/projects', label: 'Projects', icon: 'folder' },
    messages,
    { to: '/account', label: 'Account', icon: 'user' },
  ]
}

const isActive = (item: NavItem, path: string) =>
  item.to === '/'
    ? path === '/'
    : path === item.to || path.startsWith(`${item.to}/`) || (item.to === '/jobs' && path === '/quotes')

/** The page for the current address. */
function Screen({ path, user }: { path: string; user: User }) {
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
    <Empty title="There's nothing at this address.">
      <Link to="/" className="button button--secondary">
        Go to the home page
      </Link>
    </Empty>
  )
}

/** The logged-in app: the menu, and the page for the current address. */
export default function App({ user, onUserChange, onLogout }: Props) {
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
  const items = navFor(user, summary)

  return (
    <SessionContext.Provider value={session}>
      <div className="app">
        <header className="topbar">
          <div className="topbar__inner">
            <Link to="/" className="topbar__logo" aria-label="BuildBridge home">
              <Logo small />
            </Link>
            <nav className="nav" aria-label="Main">
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
                    {item.count ? <CountBadge count={item.count} label={`${item.count} ${item.countLabel}`} /> : null}
                  </Link>
                )
              })}
            </nav>
          </div>
        </header>
        <main className="main">
          <Screen path={path} user={user} />
        </main>
      </div>
    </SessionContext.Provider>
  )
}
