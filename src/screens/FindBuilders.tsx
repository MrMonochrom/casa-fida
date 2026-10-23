import { useEffect, useState } from 'react'
import { TRADES, TRADE_KEYS } from '../../shared/rules'
import type { Trade } from '../../shared/rules'
import { api } from '../api'
import { BuilderCard } from '../components/BuilderCard'
import { Empty, Loading, PageHeader } from '../components/ui'
import { plural } from '../format'
import { Link } from '../components/Link'
import { useSession } from '../session'
import { useResource } from '../useResource'

// Waits for a pause in typing before searching.
const SEARCH_DELAY_MS = 300

/** Builders with a profile, best rated first, filtered by trade and a search. */
export function FindBuilders() {
  const { user } = useSession()
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  const [trade, setTrade] = useState<Trade | ''>('')

  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [typed])

  const { data: builders, error, reload } = useResource(() => api.builders(q, trade), `${q}|${trade}`)

  return (
    <>
      <PageHeader
        title="Find a builder"
        subtitle="Compare local builders by their reviews and past work, then message them or post a job for quotes."
        actions={
          user.role === 'client' && (
            <Link to="/jobs/new" className="button button--primary">
              Post a job
            </Link>
          )
        }
      />
      <div className="filters" role="search">
        <input
          className="input"
          type="search"
          placeholder="Search by name or area"
          aria-label="Search builders"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <select
          className="input select"
          aria-label="Trade"
          value={trade}
          onChange={(e) => setTrade(e.target.value as Trade | '')}
        >
          <option value="">All trades</option>
          {TRADE_KEYS.map((key) => (
            <option key={key} value={key}>
              {TRADES[key]}
            </option>
          ))}
        </select>
      </div>

      {!builders ? (
        <Loading error={error} onRetry={reload} />
      ) : builders.length === 0 ? (
        <Empty title="No builders match that search.">
          <p className="muted">Try another trade or a nearby town.</p>
        </Empty>
      ) : (
        <>
          <p className="muted result-count" role="status">
            {plural(builders.length, 'builder')}
          </p>
          <div className="card-grid">
            {builders.map((builder) => (
              <BuilderCard key={builder.id} builder={builder} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
