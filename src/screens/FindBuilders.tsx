import { useEffect, useState } from 'react'
import { TRADE_KEYS } from '../../shared/rules'
import type { Trade } from '../../shared/rules'
import { api } from '../api'
import { BuilderCard } from '../components/BuilderCard'
import { Empty, Loading, PageHeader } from '../components/ui'
import { useT } from '../i18n'
import { Link } from '../components/Link'
import { useSession } from '../session'
import { useResource } from '../useResource'

// Waits for a pause in typing before searching.
const SEARCH_DELAY_MS = 300

/** Builders with a profile, best rated first, filtered by trade and a search. */
export function FindBuilders() {
  const t = useT()
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
        title={t.builders.title}
        subtitle={t.builders.subtitle}
        actions={
          user.role === 'client' && (
            <Link to="/jobs/new" className="button button--primary">
              {t.common.postJob}
            </Link>
          )
        }
      />
      <div className="filters" role="search">
        <input
          className="input"
          type="search"
          placeholder={t.builders.searchPlaceholder}
          aria-label={t.builders.searchLabel}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <select
          className="input select"
          aria-label={t.builders.trade}
          value={trade}
          onChange={(e) => setTrade(e.target.value as Trade | '')}
        >
          <option value="">{t.builders.allTrades}</option>
          {TRADE_KEYS.map((key) => (
            <option key={key} value={key}>
              {t.trades[key]}
            </option>
          ))}
        </select>
      </div>

      {!builders ? (
        <Loading error={error} onRetry={reload} />
      ) : builders.length === 0 ? (
        <Empty title={t.builders.noMatch}>
          <p className="muted">{t.builders.noMatchText}</p>
        </Empty>
      ) : (
        <>
          <p className="muted result-count" role="status">
            {t.counts.builders(builders.length)}
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
