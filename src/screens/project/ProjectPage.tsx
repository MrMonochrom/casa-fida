import { useState } from 'react'
import type { FormEvent } from 'react'
import { DESCRIPTION_MAX, PLACE_MAX, REVIEW_MAX, TITLE_MAX } from '../../../shared/rules'
import { api } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { CurrencyField } from '../../components/CurrencyField'
import { Dialog } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { MessageButton } from '../../components/MessageButton'
import {
  BackLink,
  CountBadge,
  FormError,
  Loading,
  MoneyField,
  StarInput,
  Stars,
  StatusPill,
  TextAreaField,
  TextField,
} from '../../components/ui'
import { dateText, dayDateText, formatMoney, moneyInputValue, parseMoney, projectStatus, weeksText } from '../../format'
import { fill, getT, useT } from '../../i18n'
import { Link } from '../../components/Link'
import { navigate, useSearchParams } from '../../router'
import { useServerEvents } from '../../serverEvents'
import { useSession } from '../../session'
import type { Project } from '../../types'
import { useResource } from '../../useResource'
import { Money } from './Money'
import { Stages } from './Stages'
import { Updates } from './Updates'

type Tab = 'overview' | 'updates' | 'money'
type Confirming = 'accept' | 'decline' | 'withdraw' | 'complete' | null

/** Everything about one project, for its builder and its client. */
export function ProjectPage({ id }: { id: number | null }) {
  const t = useT()
  const { refreshSummary } = useSession()
  const params = useSearchParams()
  const project = useResource(
    () => (id ? api.project(id) : Promise.reject(new Error(getT().project.gone))),
    String(id),
  )
  const updates = useResource(() => (id ? api.updates(id) : Promise.resolve([])), String(id))
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [editing, setEditing] = useState(false)

  useServerEvents((event) => {
    if (event.type === 'project' && event.projectId === id) {
      project.reload()
      updates.reload()
    }
  })

  const p = project.data
  if (!p) {
    return (
      <>
        <BackLink to="/projects">{t.nav.projects}</BackLink>
        <Loading error={project.error} onRetry={project.reload} />
      </>
    )
  }

  const isBuilder = p.myRole === 'builder'
  const started = p.status === 'active' || p.status === 'completed'
  const requested = params.get('tab')
  const tab: Tab = started && (requested === 'updates' || requested === 'money') ? requested : 'overview'
  const other = isBuilder ? p.client : { id: p.builder.id, name: p.builder.businessName }

  function showTab(next: Tab) {
    navigate(next === 'overview' ? `/projects/${p!.id}` : `/projects/${p!.id}?tab=${next}`, { replace: true })
  }

  function changed(updated: Project) {
    project.setData(updated)
    refreshSummary()
  }

  async function confirm() {
    switch (confirming) {
      case 'accept':
        changed(await api.acceptProject(p!.id))
        break
      case 'decline':
        changed(await api.declineProject(p!.id))
        break
      case 'complete':
        changed(await api.completeProject(p!.id))
        break
      case 'withdraw':
        await api.deleteProject(p!.id)
        navigate('/projects', { replace: true })
        return
    }
    setConfirming(null)
  }

  const pendingChanges = p.changeOrders.filter((c) => c.status === 'pending').length
  const dueInvoices = p.invoices.filter((i) => i.status === 'due').length

  return (
    <>
      <BackLink to="/projects">{t.nav.projects}</BackLink>
      <div className="page-header">
        <div className="page-header__text">
          <div className="title-row">
            <h1 className="page-title">{p.title}</h1>
            <StatusPill look={projectStatus(p.status)} />
          </div>
          <p className="page-subtitle">
            {isBuilder
              ? t.project.forClient(p.client?.name ?? t.projects.invited(p.invitedClient?.name ?? ''))
              : t.project.withBuilder(p.builder.businessName)}
            {p.address && ` · ${p.address}`}
          </p>
        </div>
        <div className="page-header__actions">
          {other && <MessageButton userId={other.id} />}
          {isBuilder && (p.status === 'proposed' || p.status === 'active') && (
            <button type="button" className="button button--secondary" onClick={() => setEditing(true)}>
              {t.project.editDetails}
            </button>
          )}
          {isBuilder && p.status === 'active' && (
            <button type="button" className="button button--primary" onClick={() => setConfirming('complete')}>
              {t.project.markCompleted}
            </button>
          )}
          {isBuilder && (p.status === 'proposed' || p.status === 'declined') && (
            <button type="button" className="button button--ghost" onClick={() => setConfirming('withdraw')}>
              {p.status === 'proposed' ? t.project.withdrawProposal : t.common.remove}
            </button>
          )}
        </div>
      </div>

      {p.status === 'proposed' && <ProposalPanel project={p} onAnswer={setConfirming} />}
      {p.status === 'declined' && (
        <p className="notice">
          {isBuilder ? t.project.clientDeclined(p.client?.name) : t.project.youDeclined}
        </p>
      )}

      {started && (
        <nav className="tabs" aria-label={t.project.tabs}>
          <button
            type="button"
            className={`tabs__tab ${tab === 'overview' ? 'tabs__tab--active' : ''}`}
            aria-current={tab === 'overview' ? 'page' : undefined}
            onClick={() => showTab('overview')}
          >
            {t.project.overview}
          </button>
          <button
            type="button"
            className={`tabs__tab ${tab === 'updates' ? 'tabs__tab--active' : ''}`}
            aria-current={tab === 'updates' ? 'page' : undefined}
            onClick={() => showTab('updates')}
          >
            {t.project.updates}{' '}
            {updates.data && updates.data.length > 0 && <span className="muted">{updates.data.length}</span>}
          </button>
          <button
            type="button"
            className={`tabs__tab ${tab === 'money' ? 'tabs__tab--active' : ''}`}
            aria-current={tab === 'money' ? 'page' : undefined}
            onClick={() => showTab('money')}
          >
            {t.project.changesAndInvoices}{' '}
            <CountBadge
              count={isBuilder ? 0 : pendingChanges + dueInvoices}
              label={t.project.waitingForYou(pendingChanges + dueInvoices)}
            />
          </button>
        </nav>
      )}

      {tab === 'overview' && <Overview project={p} onChange={changed} latestUpdate={updates.data?.[0]?.body} />}
      {tab === 'updates' && (
        <Updates project={p} updates={updates.data} error={updates.error} onReload={updates.reload} />
      )}
      {tab === 'money' && <Money project={p} onChange={changed} />}

      {editing && <EditProjectDialog project={p} onDone={changed} onClose={() => setEditing(false)} />}
      {confirming === 'accept' && (
        <ConfirmDialog
          title={t.project.acceptTitle}
          message={
            <p>
              {fill(t.project.acceptText, {
                price: <strong>{formatMoney(p.money.contract, p.currency)}</strong>,
                builder: p.builder.businessName,
              })}
            </p>
          }
          confirmLabel={t.project.acceptProposal}
          onConfirm={confirm}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'decline' && (
        <ConfirmDialog
          title={t.project.declineTitle}
          message={t.project.declineText(p.builder.businessName)}
          confirmLabel={t.project.declineProposal}
          danger
          onConfirm={confirm}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'complete' && (
        <ConfirmDialog
          title={t.project.completeTitle}
          message={t.project.completeText}
          confirmLabel={t.project.markCompleted}
          onConfirm={confirm}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'withdraw' && (
        <ConfirmDialog
          title={p.status === 'proposed' ? t.project.withdrawTitle : t.project.removeTitle}
          message={p.status === 'proposed' ? t.project.withdrawText : t.project.removeText}
          confirmLabel={p.status === 'proposed' ? t.project.withdrawProposal : t.common.remove}
          danger
          onConfirm={confirm}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  )
}

/** A proposal waiting for an answer: the client accepts or declines; the builder waits (and can resend the invite). */
function ProposalPanel({ project, onAnswer }: { project: Project; onAnswer: (answer: 'accept' | 'decline') => void }) {
  const t = useT()
  if (project.myRole === 'client') {
    return (
      <div className="banner banner--brand proposal">
        <div>
          <p className="eyebrow">{t.project.proposalFrom(project.builder.businessName)}</p>
          <p className="proposal__price">{formatMoney(project.money.contract, project.currency)}</p>
          <p className="muted">
            {t.project.sentOn(dateText(project.createdAt))}
            {project.startDate && ` · ${t.project.starting(dayDateText(project.startDate))}`}
          </p>
        </div>
        <div className="proposal__actions">
          <button type="button" className="button button--secondary" onClick={() => onAnswer('decline')}>
            {t.common.decline}
          </button>
          <button type="button" className="button button--primary" onClick={() => onAnswer('accept')}>
            {t.project.acceptProposal}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="banner banner--info">
      <p>
        {project.client
          ? fill(t.project.waitingForName, { name: <strong>{project.client.name}</strong> })
          : fill(t.project.emailedInvite, { email: <strong>{project.invitedClient?.email}</strong> })}
      </p>
      {!project.client && <InviteLink projectId={project.id} />}
    </div>
  )
}

/** A fresh invite link, for a client who didn't get the email. The old link stops working. */
function InviteLink({ projectId }: { projectId: number }) {
  const t = useT()
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setError(null)
    try {
      setLink(await api.inviteLink(projectId))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setError(t.project.copyFailed)
    }
  }

  if (!link) {
    return (
      <>
        <button type="button" className="button button--secondary" onClick={create}>
          {t.project.getLink}
        </button>
        <FormError error={error} />
      </>
    )
  }
  return (
    <div className="invite-link">
      <input className="input" readOnly value={link} aria-label={t.project.inviteLink} onFocus={(e) => e.target.select()} />
      <button type="button" className="button button--secondary" onClick={copy}>
        {copied ? t.project.copied : t.project.copy}
      </button>
      <p className="field__hint">{t.project.oldLinkDead}</p>
      <FormError error={error} />
    </div>
  )
}

function Overview({
  project: p,
  onChange,
  latestUpdate,
}: {
  project: Project
  onChange: (project: Project) => void
  latestUpdate?: string
}) {
  const t = useT()
  const isBuilder = p.myRole === 'builder'
  const contact = isBuilder ? p.client : { ...p.builder, name: `${p.builder.name} · ${p.builder.businessName}` }

  return (
    <div className="two-col two-col--wide-left">
      <div>
        <section className="section">
          <h2 className="section__title">{t.common.theWork}</h2>
          <div className="card">
            <p className="prewrap">{p.description}</p>
            {p.fromQuote && (
              <p className="muted small">
                {fill(isBuilder ? t.project.fromYourQuote : t.project.fromYourJob, {
                  link: (
                    <Link to={`/jobs/${p.fromQuote.jobId}`} className="text-link">
                      {isBuilder ? t.project.theClientsJob : t.project.postedOnCasaFida}
                    </Link>
                  ),
                })}
                {p.fromQuote.weeks && ` · ${t.project.quotedAbout(weeksText(p.fromQuote.weeks))}`}
              </p>
            )}
          </div>
        </section>
        <Stages project={p} onChange={onChange} />
        {p.status === 'active' && latestUpdate && (
          <section className="section">
            <div className="section__header">
              <h2 className="section__title">{t.project.latestUpdate}</h2>
              <Link to={`/projects/${p.id}?tab=updates`} className="text-link">
                {t.project.allUpdates}
              </Link>
            </div>
            <div className="card">
              <p className="prewrap clamp">{latestUpdate}</p>
            </div>
          </section>
        )}
        <ReviewSection project={p} onChange={onChange} />
      </div>

      <aside>
        <section className="section">
          <h2 className="section__title">{t.project.details}</h2>
          <div className="card">
            <dl className="facts-list facts-list--stacked">
              <div>
                <dt>{p.status === 'proposed' ? t.project.proposedPrice : t.project.totalPrice}</dt>
                <dd>
                  <strong>{formatMoney(p.money.total, p.currency)}</strong>
                  {p.money.changes !== 0 && (
                    <span className="muted small"> {t.project.agreedWithChanges(formatMoney(p.money.contract, p.currency))}</span>
                  )}
                </dd>
              </div>
              {p.status !== 'proposed' && p.status !== 'declined' && (
                <div>
                  <dt>{t.project.paidSoFar}</dt>
                  <dd>{formatMoney(p.money.paid, p.currency)}</dd>
                </div>
              )}
              {p.startDate && (
                <div>
                  <dt>{t.common.startDate}</dt>
                  <dd>{dayDateText(p.startDate)}</dd>
                </div>
              )}
              {p.acceptedAt && (
                <div>
                  <dt>{t.project.agreed}</dt>
                  <dd>{dateText(p.acceptedAt)}</dd>
                </div>
              )}
              {p.completedAt && (
                <div>
                  <dt>{t.project.completed}</dt>
                  <dd>{dateText(p.completedAt)}</dd>
                </div>
              )}
              {p.address && (
                <div>
                  <dt>{t.common.address}</dt>
                  <dd>{p.address}</dd>
                </div>
              )}
            </dl>
          </div>
        </section>
        {contact && (
          <section className="section">
            <h2 className="section__title">{isBuilder ? t.common.yourClient : t.project.yourBuilder}</h2>
            <div className="card contact">
              <p>
                <strong>{contact.name}</strong>
              </p>
              <a className="contact__line" href={`mailto:${contact.email}`}>
                <Icon name="mail" size={16} /> {contact.email}
              </a>
              {contact.phone && (
                <a className="contact__line" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>
                  <Icon name="phone" size={16} /> {contact.phone}
                </a>
              )}
              {!isBuilder && (
                <Link to={`/builders/${p.builder.id}`} className="text-link">
                  {t.project.viewProfile}
                </Link>
              )}
            </div>
          </section>
        )}
      </aside>
    </div>
  )
}

/** The client's review once the project is done: the form, or the review itself. */
function ReviewSection({ project, onChange }: { project: Project; onChange: (project: Project) => void }) {
  const t = useT()
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (project.status !== 'completed') return null

  if (project.review) {
    return (
      <section className="section">
        <h2 className="section__title">{project.myRole === 'client' ? t.project.yourReview : t.project.clientReview}</h2>
        <div className="card review">
          <div className="review__top">
            <Stars value={project.review.rating} />
            <span className="visually-hidden">{t.ui.outOfFive(project.review.rating)}</span>
            <span className="muted">{dateText(project.review.createdAt)}</span>
          </div>
          {project.review.body && <p className="prewrap">{project.review.body}</p>}
        </div>
      </section>
    )
  }
  if (project.myRole === 'builder') {
    return (
      <section className="section">
        <h2 className="section__title">{t.project.clientReview}</h2>
        <p className="muted">{t.project.noReviewYet}</p>
      </section>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!rating) {
      setError(t.project.chooseRating)
      return
    }
    setBusy(true)
    setError(null)
    try {
      onChange(await api.review(project.id, rating, body))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <section className="section">
      <h2 className="section__title">{t.project.howDidItGo}</h2>
      <form className="card form" onSubmit={handleSubmit} noValidate>
        <p className="muted">{t.project.reviewAppears(project.builder.businessName)}</p>
        <StarInput value={rating} onChange={setRating} />
        <TextAreaField
          label={t.project.yourReview}
          extra={t.common.optional}
          value={body}
          onChange={setBody}
          maxLength={REVIEW_MAX}
          placeholder={t.project.reviewPlaceholder}
        />
        <FormError error={error} />
        <div className="form-actions form-actions--start">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? t.common.posting : t.project.postReview}
          </button>
        </div>
      </form>
    </section>
  )
}

function EditProjectDialog({
  project,
  onDone,
  onClose,
}: {
  project: Project
  onDone: (project: Project) => void
  onClose: () => void
}) {
  const t = useT()
  const [title, setTitle] = useState(project.title)
  const [description, setDescription] = useState(project.description)
  const [address, setAddress] = useState(project.address)
  const [startDate, setStartDate] = useState(project.startDate ?? '')
  const [price, setPrice] = useState(moneyInputValue(project.money.contract))
  const [currency, setCurrency] = useState(project.currency)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const priceLocked = project.status !== 'proposed'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const contractAmount = priceLocked ? project.money.contract : parseMoney(price)
    if (contractAmount === null || contractAmount <= 0) {
      setError(t.project.enterPrice)
      return
    }
    setBusy(true)
    setError(null)
    try {
      onDone(
        await api.saveProject(project.id, {
          title,
          description,
          address,
          startDate: startDate || null,
          currency,
          contractAmount,
        }),
      )
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog title={t.project.editTitle} onClose={onClose} wide>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <TextField label={t.common.title} value={title} onChange={setTitle} maxLength={TITLE_MAX} />
        <TextAreaField
          label={t.common.whatsIncluded}
          value={description}
          onChange={setDescription}
          maxLength={DESCRIPTION_MAX}
          rows={6}
        />
        <TextField label={t.common.address} extra={t.common.optional} value={address} onChange={setAddress} maxLength={PLACE_MAX} />
        <div className="form-row">
          <MoneyField
            label={t.common.price}
            value={price}
            onChange={setPrice}
            currency={currency}
            disabled={priceLocked}
            hint={priceLocked ? t.project.priceLocked : undefined}
          />
          <CurrencyField value={currency} onChange={setCurrency} disabled={priceLocked} />
        </div>
        <div className="form-row">
          <TextField
            label={t.common.startDate}
            extra={t.common.optional}
            type="date"
            value={startDate}
            onChange={setStartDate}
          />
        </div>
        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? t.common.saving : t.common.saveChanges}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
