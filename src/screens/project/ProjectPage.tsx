import { useState } from 'react'
import type { FormEvent } from 'react'
import { formatMoney, moneyInputValue, parseMoney } from '../../../shared/money'
import { DESCRIPTION_MAX, PLACE_MAX, REVIEW_MAX, TITLE_MAX } from '../../../shared/rules'
import { api } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
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
import { PROJECT_STATUS, dateText, dayDateText, weeksText } from '../../format'
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
  const { refreshSummary } = useSession()
  const params = useSearchParams()
  const project = useResource(
    () => (id ? api.project(id) : Promise.reject(new Error("This project doesn't exist."))),
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
        <BackLink to="/projects">Projects</BackLink>
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
      <BackLink to="/projects">Projects</BackLink>
      <div className="page-header">
        <div className="page-header__text">
          <div className="title-row">
            <h1 className="page-title">{p.title}</h1>
            <StatusPill look={PROJECT_STATUS[p.status]} />
          </div>
          <p className="page-subtitle">
            {isBuilder
              ? `For ${p.client?.name ?? `${p.invitedClient?.name} (invited)`}`
              : `With ${p.builder.businessName}`}
            {p.address && ` · ${p.address}`}
          </p>
        </div>
        <div className="page-header__actions">
          {other && <MessageButton userId={other.id} />}
          {isBuilder && (p.status === 'proposed' || p.status === 'active') && (
            <button type="button" className="button button--secondary" onClick={() => setEditing(true)}>
              Edit details
            </button>
          )}
          {isBuilder && p.status === 'active' && (
            <button type="button" className="button button--primary" onClick={() => setConfirming('complete')}>
              Mark as completed
            </button>
          )}
          {isBuilder && (p.status === 'proposed' || p.status === 'declined') && (
            <button type="button" className="button button--ghost" onClick={() => setConfirming('withdraw')}>
              {p.status === 'proposed' ? 'Withdraw proposal' : 'Remove'}
            </button>
          )}
        </div>
      </div>

      {p.status === 'proposed' && <ProposalPanel project={p} onAnswer={setConfirming} />}
      {p.status === 'declined' && (
        <p className="notice">
          {isBuilder ? `${p.client?.name ?? 'The client'} declined this proposal.` : 'You declined this proposal.'}
        </p>
      )}

      {started && (
        <nav className="tabs" aria-label="Project">
          <button
            type="button"
            className={`tabs__tab ${tab === 'overview' ? 'tabs__tab--active' : ''}`}
            aria-current={tab === 'overview' ? 'page' : undefined}
            onClick={() => showTab('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`tabs__tab ${tab === 'updates' ? 'tabs__tab--active' : ''}`}
            aria-current={tab === 'updates' ? 'page' : undefined}
            onClick={() => showTab('updates')}
          >
            Updates {updates.data && updates.data.length > 0 && <span className="muted">{updates.data.length}</span>}
          </button>
          <button
            type="button"
            className={`tabs__tab ${tab === 'money' ? 'tabs__tab--active' : ''}`}
            aria-current={tab === 'money' ? 'page' : undefined}
            onClick={() => showTab('money')}
          >
            Changes &amp; invoices{' '}
            <CountBadge
              count={isBuilder ? 0 : pendingChanges + dueInvoices}
              label={`${pendingChanges + dueInvoices} waiting for you`}
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
          title="Accept this proposal?"
          message={
            <p>
              You're agreeing to the work described for <strong>{formatMoney(p.money.contract)}</strong>. The project
              starts, and {p.builder.businessName} can post updates and send invoices here.
            </p>
          }
          confirmLabel="Accept proposal"
          onConfirm={confirm}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'decline' && (
        <ConfirmDialog
          title="Decline this proposal?"
          message={`${p.builder.businessName} will see that you declined it. You can still message them.`}
          confirmLabel="Decline proposal"
          danger
          onConfirm={confirm}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'complete' && (
        <ConfirmDialog
          title="Mark the project as completed?"
          message="All stages are marked done, and your client is asked to leave a review. You can still send invoices for anything not billed yet."
          confirmLabel="Mark as completed"
          onConfirm={confirm}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'withdraw' && (
        <ConfirmDialog
          title={p.status === 'proposed' ? 'Withdraw this proposal?' : 'Remove this proposal?'}
          message={
            p.status === 'proposed'
              ? "It's deleted, and your client can't accept it any more."
              : 'It disappears from your projects.'
          }
          confirmLabel={p.status === 'proposed' ? 'Withdraw proposal' : 'Remove'}
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
  if (project.myRole === 'client') {
    return (
      <div className="banner banner--brand proposal">
        <div>
          <p className="eyebrow">Proposal from {project.builder.businessName}</p>
          <p className="proposal__price">{formatMoney(project.money.contract)}</p>
          <p className="muted">
            Sent {dateText(project.createdAt)}
            {project.startDate && ` · starting ${dayDateText(project.startDate)}`}
          </p>
        </div>
        <div className="proposal__actions">
          <button type="button" className="button button--secondary" onClick={() => onAnswer('decline')}>
            Decline
          </button>
          <button type="button" className="button button--primary" onClick={() => onAnswer('accept')}>
            Accept proposal
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="banner banner--info">
      <p>
        {project.client ? (
          <>
            Waiting for <strong>{project.client.name}</strong> to accept. They can see it in their account.
          </>
        ) : (
          <>
            We emailed an invite to <strong>{project.invitedClient?.email}</strong>. Once they sign up, they can accept
            the proposal.
          </>
        )}
      </p>
      {!project.client && <InviteLink projectId={project.id} />}
    </div>
  )
}

/** A fresh invite link, for a client who didn't get the email. The old link stops working. */
function InviteLink({ projectId }: { projectId: number }) {
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
      setError("Couldn't copy it. Select the link and copy it yourself.")
    }
  }

  if (!link) {
    return (
      <>
        <button type="button" className="button button--secondary" onClick={create}>
          Get a link to send yourself
        </button>
        <FormError error={error} />
      </>
    )
  }
  return (
    <div className="invite-link">
      <input className="input" readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
      <button type="button" className="button button--secondary" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <p className="field__hint">The link in the first email no longer works.</p>
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
  const isBuilder = p.myRole === 'builder'
  const contact = isBuilder ? p.client : { ...p.builder, name: `${p.builder.name} · ${p.builder.businessName}` }

  return (
    <div className="two-col two-col--wide-left">
      <div>
        <section className="section">
          <h2 className="section__title">The work</h2>
          <div className="card">
            <p className="prewrap">{p.description}</p>
            {p.fromQuote && (
              <p className="muted small">
                From {isBuilder ? 'your quote on' : 'your job'}{' '}
                <Link to={`/jobs/${p.fromQuote.jobId}`} className="text-link">
                  {isBuilder ? 'the client’s job' : 'posted on BuildBridge'}
                </Link>
                {p.fromQuote.weeks && ` · quoted at about ${weeksText(p.fromQuote.weeks)}`}
              </p>
            )}
          </div>
        </section>
        <Stages project={p} onChange={onChange} />
        {p.status === 'active' && latestUpdate && (
          <section className="section">
            <div className="section__header">
              <h2 className="section__title">Latest update</h2>
              <Link to={`/projects/${p.id}?tab=updates`} className="text-link">
                All updates
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
          <h2 className="section__title">Details</h2>
          <div className="card">
            <dl className="facts-list facts-list--stacked">
              <div>
                <dt>{p.status === 'proposed' ? 'Proposed price' : 'Total price'}</dt>
                <dd>
                  <strong>{formatMoney(p.money.total)}</strong>
                  {p.money.changes !== 0 && (
                    <span className="muted small"> ({formatMoney(p.money.contract)} agreed, with changes)</span>
                  )}
                </dd>
              </div>
              {p.status !== 'proposed' && p.status !== 'declined' && (
                <div>
                  <dt>Paid so far</dt>
                  <dd>{formatMoney(p.money.paid)}</dd>
                </div>
              )}
              {p.startDate && (
                <div>
                  <dt>Start date</dt>
                  <dd>{dayDateText(p.startDate)}</dd>
                </div>
              )}
              {p.acceptedAt && (
                <div>
                  <dt>Agreed</dt>
                  <dd>{dateText(p.acceptedAt)}</dd>
                </div>
              )}
              {p.completedAt && (
                <div>
                  <dt>Completed</dt>
                  <dd>{dateText(p.completedAt)}</dd>
                </div>
              )}
              {p.address && (
                <div>
                  <dt>Address</dt>
                  <dd>{p.address}</dd>
                </div>
              )}
            </dl>
          </div>
        </section>
        {contact && (
          <section className="section">
            <h2 className="section__title">{isBuilder ? 'Your client' : 'Your builder'}</h2>
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
                  View their profile
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
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (project.status !== 'completed') return null

  if (project.review) {
    return (
      <section className="section">
        <h2 className="section__title">{project.myRole === 'client' ? 'Your review' : 'Client review'}</h2>
        <div className="card review">
          <div className="review__top">
            <Stars value={project.review.rating} />
            <span className="visually-hidden">{project.review.rating} out of 5 stars</span>
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
        <h2 className="section__title">Client review</h2>
        <p className="muted">Your client hasn't left a review yet.</p>
      </section>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!rating) {
      setError('Choose a rating from 1 to 5 stars.')
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
      <h2 className="section__title">How did it go?</h2>
      <form className="card form" onSubmit={handleSubmit} noValidate>
        <p className="muted">
          Your review appears on {project.builder.businessName}'s profile with your first name and last initial.
        </p>
        <StarInput value={rating} onChange={setRating} />
        <TextAreaField
          label="Your review"
          extra="(optional)"
          value={body}
          onChange={setBody}
          maxLength={REVIEW_MAX}
          placeholder="What went well, and what could have gone better?"
        />
        <FormError error={error} />
        <div className="form-actions form-actions--start">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Posting…' : 'Post review'}
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
  const [title, setTitle] = useState(project.title)
  const [description, setDescription] = useState(project.description)
  const [address, setAddress] = useState(project.address)
  const [startDate, setStartDate] = useState(project.startDate ?? '')
  const [price, setPrice] = useState(moneyInputValue(project.money.contract))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const priceLocked = project.status !== 'proposed'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const contractAmount = priceLocked ? project.money.contract : parseMoney(price)
    if (contractAmount === null || contractAmount <= 0) {
      setError('Enter the price for the work.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onDone(await api.saveProject(project.id, { title, description, address, startDate: startDate || null, contractAmount }))
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog title="Edit project details" onClose={onClose} wide>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <TextField label="Title" value={title} onChange={setTitle} maxLength={TITLE_MAX} />
        <TextAreaField
          label="What's included"
          value={description}
          onChange={setDescription}
          maxLength={DESCRIPTION_MAX}
          rows={6}
        />
        <TextField label="Address" extra="(optional)" value={address} onChange={setAddress} maxLength={PLACE_MAX} />
        <div className="form-row">
          <MoneyField
            label="Price"
            value={price}
            onChange={setPrice}
            disabled={priceLocked}
            hint={priceLocked ? 'The price is agreed. Send a change order to change it.' : undefined}
          />
          <TextField label="Start date" extra="(optional)" type="date" value={startDate} onChange={setStartDate} />
        </div>
        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
