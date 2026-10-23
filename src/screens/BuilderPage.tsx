import { api } from '../api'
import { BuilderFacts } from '../components/BuilderCard'
import { MessageButton } from '../components/MessageButton'
import { Avatar, BackLink, Empty, Loading, Rating, Stars } from '../components/ui'
import { dateText, tradeLabel } from '../format'
import { getT, useT } from '../i18n'
import { Link } from '../components/Link'
import { useSession } from '../session'
import { useResource } from '../useResource'

/** A builder's public profile: about, trades, credentials and reviews. */
export function BuilderPage({ id }: { id: number | null }) {
  const t = useT()
  const { user } = useSession()
  const { data: builder, error, reload } = useResource(
    () => (id ? api.builder(id) : Promise.reject(new Error(getT().builders.noProfile))),
    String(id),
  )

  if (!builder) {
    return (
      <>
        <BackLink to="/builders">{t.nav.findBuilders}</BackLink>
        <Loading error={error} onRetry={reload} />
      </>
    )
  }

  const isMe = builder.id === user.id

  return (
    <>
      <BackLink to="/builders">{t.nav.findBuilders}</BackLink>
      <div className="profile-hero card">
        <Avatar name={builder.businessName} size="large" />
        <div className="profile-hero__text">
          <h1 className="page-title">{builder.businessName}</h1>
          <p className="muted">
            {builder.name} · {builder.serviceArea} · {t.builders.since(dateText(builder.memberSince))}
          </p>
          {builder.headline && <p className="profile-hero__headline">{builder.headline}</p>}
          <Rating rating={builder.rating} count={builder.reviewCount} />
          <BuilderFacts builder={builder} />
        </div>
        <div className="profile-hero__actions">
          {user.role === 'client' && (
            <>
              <MessageButton userId={builder.id} className="button button--primary" label={t.builders.messageName(builder.name.split(' ')[0])} />
              <Link to="/jobs/new" className="button button--secondary">
                {t.common.postJob}
              </Link>
            </>
          )}
          {isMe && (
            <Link to="/account" className="button button--secondary">
              {t.builders.editProfile}
            </Link>
          )}
        </div>
      </div>

      <div className="two-col two-col--wide-left">
        <section className="section">
          <h2 className="section__title">{t.builders.about}</h2>
          <div className="card">
            <p className="prewrap">{builder.about}</p>
            <h3 className="subheading">{t.builders.trades}</h3>
            <ul className="tags">
              {builder.trades.map((trade) => (
                <li key={trade} className="tag">
                  {tradeLabel(trade)}
                </li>
              ))}
            </ul>
            {builder.licenseNumber && (
              <>
                <h3 className="subheading">{t.builders.license}</h3>
                <p>{builder.licenseNumber}</p>
              </>
            )}
          </div>
        </section>

        <section className="section">
          <h2 className="section__title">{t.builders.reviews}</h2>
          {builder.reviews.length === 0 ? (
            <Empty title={t.builders.noReviews}>
              <p className="muted">{t.builders.noReviewsText}</p>
            </Empty>
          ) : (
            <ul className="reviews">
              {builder.reviews.map((review) => (
                <li key={review.id} className="card review">
                  <div className="review__top">
                    <Stars value={review.rating} />
                    <span className="visually-hidden">{t.ui.outOfFive(review.rating)}</span>
                    <span className="muted">{dateText(review.createdAt)}</span>
                  </div>
                  {review.body && <p className="prewrap">{review.body}</p>}
                  <p className="muted review__by">
                    {review.author} · {review.projectTitle}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
