import { useState } from 'react'
import type { FormEvent } from 'react'
import { formatChange, formatMoney, moneyInputValue, parseMoney } from '../../../shared/money'
import { CHANGE_DAYS_MAX, DESCRIPTION_MAX, TITLE_MAX } from '../../../shared/rules'
import { api } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Dialog } from '../../components/Dialog'
import { Empty, FormError, MoneyField, StatusPill, TextAreaField, TextField } from '../../components/ui'
import { CHANGE_STATUS, dateText, dayDateText, daysChangeText, invoiceStatus, isoDate } from '../../format'
import { useSession } from '../../session'
import type { ChangeOrder, Invoice, Project } from '../../types'

interface Props {
  project: Project
  onChange: (project: Project) => void
}

type Confirming =
  | { kind: 'approve' | 'decline' | 'withdraw'; change: ChangeOrder }
  | { kind: 'paid' | 'void'; invoice: Invoice }
  | null

/** The price with its changes, and what's been invoiced and paid. */
export function Money({ project, onChange }: Props) {
  const { refreshSummary } = useSession()
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [adding, setAdding] = useState<'change' | 'invoice' | null>(null)
  const isBuilder = project.myRole === 'builder'
  const active = project.status === 'active'
  const { money } = project

  async function confirm() {
    if (!confirming) return
    let updated: Project
    switch (confirming.kind) {
      case 'approve':
        updated = await api.approveChange(confirming.change.id)
        break
      case 'decline':
        updated = await api.declineChange(confirming.change.id)
        break
      case 'withdraw':
        updated = await api.withdrawChange(confirming.change.id)
        break
      case 'paid':
        updated = await api.markPaid(confirming.invoice.id)
        break
      case 'void':
        updated = await api.voidInvoice(confirming.invoice.id)
        break
    }
    onChange(updated)
    refreshSummary()
    setConfirming(null)
  }

  return (
    <>
      <section className="section">
        <h2 className="section__title">Price and payments</h2>
        <div className="money-grid">
          <div className="money-tile">
            <span className="money-tile__label">Agreed price</span>
            <strong className="money-tile__value">{formatMoney(money.contract)}</strong>
          </div>
          <div className="money-tile">
            <span className="money-tile__label">Approved changes</span>
            <strong className="money-tile__value">{formatChange(money.changes)}</strong>
            {money.daysAdded !== 0 && <span className="muted small">{daysChangeText(money.daysAdded)} to the schedule</span>}
          </div>
          <div className="money-tile money-tile--total">
            <span className="money-tile__label">Total price</span>
            <strong className="money-tile__value">{formatMoney(money.total)}</strong>
          </div>
          <div className="money-tile">
            <span className="money-tile__label">Paid</span>
            <strong className="money-tile__value">{formatMoney(money.paid)}</strong>
            <div className="meter" aria-hidden="true">
              <div className="meter__fill" style={{ width: `${money.total ? Math.min(100, (money.paid / money.total) * 100) : 0}%` }} />
            </div>
          </div>
          <div className="money-tile">
            <span className="money-tile__label">Invoiced, not yet paid</span>
            <strong className="money-tile__value">{formatMoney(money.outstanding)}</strong>
          </div>
          <div className="money-tile">
            <span className="money-tile__label">Not invoiced yet</span>
            <strong className="money-tile__value">{formatMoney(money.leftToInvoice)}</strong>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__header">
          <h2 className="section__title">Change orders</h2>
          {isBuilder && active && (
            <button type="button" className="button button--secondary" onClick={() => setAdding('change')}>
              New change order
            </button>
          )}
        </div>
        <p className="section__intro muted">
          {isBuilder
            ? 'Changes to the work, price or schedule. Your client approves each one before it counts.'
            : 'Changes your builder proposes to the work, price or schedule. Nothing changes until you approve it.'}
        </p>
        {project.changeOrders.length === 0 ? (
          <Empty title="No change orders." />
        ) : (
          <ul className="items">
            {project.changeOrders.map((change) => (
              <li key={change.id} className={`card item ${change.status === 'pending' ? 'item--pending' : ''}`}>
                <div className="item__top">
                  <div>
                    <h3 className="card__title">{change.title}</h3>
                    <p className="muted small">
                      Sent {dateText(change.createdAt)}
                      {change.decidedAt && ` · answered ${dateText(change.decidedAt)}`}
                    </p>
                  </div>
                  <div className="item__amount">
                    <strong>{formatChange(change.amount)}</strong>
                    {change.days !== 0 && <span className="muted small">{daysChangeText(change.days)}</span>}
                  </div>
                </div>
                <p className="prewrap">{change.description}</p>
                <div className="item__bottom">
                  <StatusPill look={CHANGE_STATUS[change.status]} />
                  {change.status === 'pending' && active && (
                    <div className="item__actions">
                      {isBuilder ? (
                        <button type="button" className="button button--ghost button--small" onClick={() => setConfirming({ kind: 'withdraw', change })}>
                          Withdraw
                        </button>
                      ) : (
                        <>
                          <button type="button" className="button button--secondary button--small" onClick={() => setConfirming({ kind: 'decline', change })}>
                            Decline
                          </button>
                          <button type="button" className="button button--primary button--small" onClick={() => setConfirming({ kind: 'approve', change })}>
                            Approve
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section__header">
          <h2 className="section__title">Invoices</h2>
          {isBuilder && money.leftToInvoice > 0 && (
            <button type="button" className="button button--secondary" onClick={() => setAdding('invoice')}>
              New invoice
            </button>
          )}
        </div>
        <p className="section__intro muted">
          {isBuilder
            ? 'Payment happens outside Casa Fida. Mark an invoice paid when the money arrives.'
            : 'Pay your builder the way you agreed. They mark each invoice paid when the money arrives.'}
        </p>
        {project.invoices.length === 0 ? (
          <Empty title="No invoices yet." />
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">For</th>
                  <th scope="col">Due</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col">Status</th>
                  {isBuilder && (
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {project.invoices.map((invoice) => (
                  <tr key={invoice.id} className={`invoice ${invoice.status === 'void' ? 'row--void' : ''}`}>
                    <td className="invoice__number">{invoice.number}</td>
                    <td className="invoice__title">{invoice.title}</td>
                    <td className="invoice__due">
                      {/* On phones the column headings are hidden, so the date says what it is. */}
                      <span className="invoice__label">Due </span>
                      {dayDateText(invoice.dueDate)}
                    </td>
                    <td className="num invoice__amount">{formatMoney(invoice.amount)}</td>
                    <td className="invoice__status">
                      <StatusPill look={invoiceStatus(invoice)} />
                      {invoice.paidAt && <span className="muted small table__note">{dateText(invoice.paidAt)}</span>}
                    </td>
                    {isBuilder && (
                      <td className="table__actions invoice__actions">
                        {invoice.status === 'due' && (
                          <>
                            <button type="button" className="button button--secondary button--small" onClick={() => setConfirming({ kind: 'paid', invoice })}>
                              Mark paid
                            </button>
                            <button type="button" className="button button--ghost button--small" onClick={() => setConfirming({ kind: 'void', invoice })}>
                              Void
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirming && <ConfirmMoney confirming={confirming} project={project} onConfirm={confirm} onCancel={() => setConfirming(null)} />}
      {adding === 'change' && <ChangeOrderDialog project={project} onDone={onChange} onClose={() => setAdding(null)} />}
      {adding === 'invoice' && <InvoiceDialog project={project} onDone={onChange} onClose={() => setAdding(null)} />}
    </>
  )
}

function ConfirmMoney({
  confirming,
  project,
  onConfirm,
  onCancel,
}: {
  confirming: NonNullable<Confirming>
  project: Project
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const common = { onConfirm, onCancel }
  switch (confirming.kind) {
    case 'approve': {
      const { change } = confirming
      const newTotal = project.money.total + change.amount
      return (
        <ConfirmDialog
          {...common}
          title={`Approve “${change.title}”?`}
          message={
            <p>
              {change.amount === 0
                ? 'The price stays the same'
                : `The price changes by ${formatChange(change.amount)}, to ${formatMoney(newTotal)}`}
              {change.days !== 0 ? `, and the schedule by ${daysChangeText(change.days)}.` : '.'}
            </p>
          }
          confirmLabel="Approve change"
        />
      )
    }
    case 'decline':
      return (
        <ConfirmDialog
          {...common}
          title={`Decline “${confirming.change.title}”?`}
          message="The work, price and schedule stay as they are. You can message your builder to talk it over."
          confirmLabel="Decline change"
          danger
        />
      )
    case 'withdraw':
      return (
        <ConfirmDialog
          {...common}
          title="Withdraw this change order?"
          message="Your client won't be able to approve it any more."
          confirmLabel="Withdraw"
          danger
        />
      )
    case 'paid':
      return (
        <ConfirmDialog
          {...common}
          title={`Mark invoice #${confirming.invoice.number} paid?`}
          message={`Only once you've received ${formatMoney(confirming.invoice.amount)}. Your client sees it as paid.`}
          confirmLabel="Mark paid"
        />
      )
    case 'void':
      return (
        <ConfirmDialog
          {...common}
          title={`Void invoice #${confirming.invoice.number}?`}
          message="Your client won't need to pay it, and its amount can be invoiced again."
          confirmLabel="Void invoice"
          danger
        />
      )
  }
}

interface DialogProps {
  project: Project
  onDone: (project: Project) => void
  onClose: () => void
}

function ChangeOrderDialog({ project, onDone, onClose }: DialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cents = amount.trim() ? parseMoney(amount) : 0
    if (cents === null) {
      setError('Enter how much the price changes, like 2,850 or -500. Use 0 if it stays the same.')
      return
    }
    const daysText = days.trim().replace(/^−/, '-')
    if (daysText && !/^-?\d+$/.test(daysText)) {
      setError(`The schedule change should be a whole number of days, up to ${CHANGE_DAYS_MAX}.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      onDone(await api.addChangeOrder(project.id, { title, description, amount: cents, days: daysText ? Number(daysText) : 0 }))
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog title="New change order" onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <TextField label="Title" value={title} onChange={setTitle} maxLength={TITLE_MAX} placeholder="Add a skylight over the kitchen" />
        <TextAreaField
          label="What changes"
          value={description}
          onChange={setDescription}
          maxLength={DESCRIPTION_MAX}
          placeholder="The work added or taken out, and why."
        />
        <div className="form-row">
          <MoneyField
            label="Price change"
            value={amount}
            onChange={setAmount}
            hint="Use a minus sign for work taken out, like -500."
          />
          <TextField
            label="Schedule change"
            extra="(days)"
            value={days}
            onChange={setDays}
            inputMode="numeric"
            placeholder="0"
          />
        </div>
        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send to client'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function InvoiceDialog({ project, onDone, onClose }: DialogProps) {
  const left = project.money.leftToInvoice
  const [title, setTitle] = useState(project.invoices.length === 0 ? 'Deposit' : '')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(isoDate(14))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cents = parseMoney(amount)
    if (cents === null || cents <= 0) {
      setError('Enter the amount to bill.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onDone(await api.addInvoice(project.id, { title, amount: cents, dueDate }))
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog title="New invoice" onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <TextField label="What it's for" value={title} onChange={setTitle} maxLength={TITLE_MAX} placeholder="Framing complete" />
        <div className="form-row">
          <MoneyField
            label="Amount"
            value={amount}
            onChange={setAmount}
            hint={
              <>
                {formatMoney(left)} not invoiced yet.{' '}
                <button type="button" className="text-button" onClick={() => setAmount(moneyInputValue(left))}>
                  Bill all of it
                </button>
              </>
            }
          />
          <TextField label="Due" type="date" value={dueDate} onChange={setDueDate} />
        </div>
        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send invoice'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
