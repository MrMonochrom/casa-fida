import { tradeLabel } from '../format'
import { useT } from '../i18n'
import { Link } from './Link'
import type { BuilderCard as Card } from '../types'
import { Avatar, Rating } from './ui'

/** A builder in search results. */
export function BuilderCard({ builder }: { builder: Card }) {
  return (
    <Link to={`/builders/${builder.id}`} className="card card--link builder-card">
      <div className="builder-card__top">
        <Avatar name={builder.businessName} />
        <div className="builder-card__who">
          <h3 className="card__title">{builder.businessName}</h3>
          <p className="muted">
            {builder.name} · {builder.serviceArea}
          </p>
        </div>
      </div>
      {builder.headline && <p className="builder-card__headline">{builder.headline}</p>}
      <Rating rating={builder.rating} count={builder.reviewCount} />
      <ul className="tags">
        {builder.trades.map((trade) => (
          <li key={trade} className="tag">
            {tradeLabel(trade)}
          </li>
        ))}
      </ul>
      <BuilderFacts builder={builder} />
    </Link>
  )
}

/** Licensed, insured, years in business and finished projects, as small badges. */
export function BuilderFacts({ builder }: { builder: Card }) {
  const t = useT()
  const facts: string[] = []
  if (builder.licensed) facts.push(t.common.licensed)
  if (builder.insured) facts.push(t.common.insured)
  if (builder.yearsInBusiness) facts.push(t.builders.yearsInBusiness(builder.yearsInBusiness))
  if (builder.completedProjects) facts.push(t.builders.projectsOnCasaFida(builder.completedProjects))
  if (facts.length === 0) return null
  return (
    <ul className="facts">
      {facts.map((fact) => (
        <li key={fact} className="fact">
          {fact}
        </li>
      ))}
    </ul>
  )
}
