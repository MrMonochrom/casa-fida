import { useState } from 'react'
import type { FormEvent } from 'react'
import { CHANGE_DAYS_MAX, DESCRIPTION_MAX, TITLE_MAX } from '../../../shared/rules'
import { api } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Dialog } from '../../components/Dialog'
import { Empty, FormError, MoneyField, StatusPill, TextAreaField, TextField } from '../../components/ui'
import {
  changeStatus,
  dateText,
  dayDateText,
  daysChangeText,
  formatChange,
  formatMoney,
  invoiceStatus,
  isoDate,
  moneyInputValue,
  parseMoney,
} from '../../format'
import { fill, useT } from '../../i18n'
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
  const t = useT()
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
        <h2 className="section__title">{t.money.priceAndPayments}</h2>
        <div className="money-grid">
          <div className="money-tile">
            <span className="money-tile__label">{t.money.agreedPrice}</span>
            <strong className="money-tile__value">{formatMoney(money.contract, project.currency)}</strong>
          </div>
          <div className="money-tile">
            <span className="money-tile__label">{t.money.approvedChanges}</span>
            <strong className="money-tile__value">{formatChange(money.changes, project.currency)}</strong>
            {money.daysAdded !== 0 && (
              <span className="muted small">{t.money.toSchedule(daysChangeText(money.daysAdded))}</span>
            )}
          </div>
          <div className="money-tile money-tile--total">
            <span className="money-tile__label">{t.money.totalPrice}</span>
            <strong className="money-tile__value">{formatMoney(money.total, project.currency)}</strong>
          </div>
          <div className="money-tile">
            <span className="money-tile__label">{t.money.paid}</span>
            <strong className="money-tile__value">{formatMoney(money.paid, project.currency)}</strong>
            <div className="meter" aria-hidden="true">
              <div className="meter__fill" style={{ width: `${money.total ? Math.min(100, (money.paid / money.total) * 100) : 0}%` }} />
            </div>
          </div>
          <div className="money-tile">
            <span className="money-tile__label">{t.money.invoicedNotPaid}</span>
            <strong className="money-tile__value">{formatMoney(money.outstanding, project.currency)}</strong>
          </div>
          <div className="money-tile">
            <span className="money-tile__label">{t.money.notInvoiced}</span>
            <strong className="money-tile__value">{formatMoney(money.leftToInvoice, project.currency)}</strong>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__header">
          <h2 className="section__title">{t.money.changeOrders}</h2>
          {isBuilder && active && (
            <button type="button" className="button button--secondary" onClick={() => setAdding('change')}>
              {t.money.newChangeOrder}
            </button>
          )}
        </div>
        <p className="section__intro muted">{isBuilder ? t.money.changesIntroBuilder : t.money.changesIntroClient}</p>
        {project.changeOrders.length === 0 ? (
          <Empty title={t.money.noChanges} />
        ) : (
          <ul className="items">
            {project.changeOrders.map((change) => (
              <li key={change.id} className={`card item ${change.status === 'pending' ? 'item--pending' : ''}`}>
                <div className="item__top">
                  <div>
                    <h3 className="card__title">{change.title}</h3>
                    <p className="muted small">
                      {t.money.changeSent(dateText(change.createdAt))}
                      {change.decidedAt && ` · ${t.money.changeAnswered(dateText(change.decidedAt))}`}
                    </p>
                  </div>
                  <div className="item__amount">
                    <strong>{formatChange(change.amount, project.currency)}</strong>
                    {change.days !== 0 && <span className="muted small">{daysChangeText(change.days)}</span>}
                  </div>
                </div>
                <p className="prewrap">{change.description}</p>
                <div className="item__bottom">
                  <StatusPill look={changeStatus(change.status)} />
                  {change.status === 'pending' && active && (
                    <div className="item__actions">
                      {isBuilder ? (
                        <button type="button" className="button button--ghost button--small" onClick={() => setConfirming({ kind: 'withdraw', change })}>
                          {t.common.withdraw}
                        </button>
                      ) : (
                        <>
                          <button type="button" className="button button--secondary button--small" onClick={() => setConfirming({ kind: 'decline', change })}>
                            {t.common.decline}
                          </button>
                          <button type="button" className="button button--primary button--small" onClick={() => setConfirming({ kind: 'approve', change })}>
                            {t.money.approve}
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
          <h2 className="section__title">{t.money.invoices}</h2>
          {isBuilder && money.leftToInvoice > 0 && (
            <button type="button" className="button button--secondary" onClick={() => setAdding('invoice')}>
              {t.money.newInvoice}
            </button>
          )}
        </div>
        <p className="section__intro muted">{isBuilder ? t.money.invoicesIntroBuilder : t.money.invoicesIntroClient}</p>
        {project.invoices.length === 0 ? (
          <Empty title={t.money.noInvoices} />
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{t.money.columnFor}</th>
                  <th scope="col">{t.money.columnDue}</th>
                  <th scope="col" className="num">
                    {t.money.columnAmount}
                  </th>
                  <th scope="col">{t.money.columnStatus}</th>
                  {isBuilder && (
                    <th scope="col">
                      <span className="visually-hidden">{t.money.actions}</span>
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
                      <span className="invoice__label">{t.money.dueLabel}</span>
                      {dayDateText(invoice.dueDate)}
                    </td>
                    <td className="num invoice__amount">{formatMoney(invoice.amount, project.currency)}</td>
                    <td className="invoice__status">
                      <StatusPill look={invoiceStatus(invoice)} />
                      {invoice.paidAt && <span className="muted small table__note">{dateText(invoice.paidAt)}</span>}
                    </td>
                    {isBuilder && (
                      <td className="table__actions invoice__actions">
                        {invoice.status === 'due' && (
                          <>
                            <button type="button" className="button button--secondary button--small" onClick={() => setConfirming({ kind: 'paid', invoice })}>
                              {t.money.markPaid}
                            </button>
                            <button type="button" className="button button--ghost button--small" onClick={() => setConfirming({ kind: 'void', invoice })}>
                              {t.money.void}
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
  const t = useT()
  const common = { onConfirm, onCancel }
  switch (confirming.kind) {
    case 'approve': {
      const { change } = confirming
      const newTotal = project.money.total + change.amount
      return (
        <ConfirmDialog
          {...common}
          title={t.money.approveTitle(change.title)}
          message={
            <p>
              {t.money.approveText(
                change.amount === 0 ? null : formatChange(change.amount, project.currency),
                formatMoney(newTotal, project.currency),
                change.days === 0 ? null : daysChangeText(change.days),
              )}
            </p>
          }
          confirmLabel={t.money.approveChange}
        />
      )
    }
    case 'decline':
      return (
        <ConfirmDialog
          {...common}
          title={t.money.declineTitle(confirming.change.title)}
          message={t.money.declineText}
          confirmLabel={t.money.declineChange}
          danger
        />
      )
    case 'withdraw':
      return (
        <ConfirmDialog
          {...common}
          title={t.money.withdrawTitle}
          message={t.money.withdrawText}
          confirmLabel={t.common.withdraw}
          danger
        />
      )
    case 'paid':
      return (
        <ConfirmDialog
          {...common}
          title={t.money.paidTitle(confirming.invoice.number)}
          message={t.money.paidText(formatMoney(confirming.invoice.amount, project.currency))}
          confirmLabel={t.money.markPaid}
        />
      )
    case 'void':
      return (
        <ConfirmDialog
          {...common}
          title={t.money.voidTitle(confirming.invoice.number)}
          message={t.money.voidText}
          confirmLabel={t.money.voidInvoice}
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
  const t = useT()
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
      setError(t.money.amountInvalid)
      return
    }
    const daysText = days.trim().replace(/^−/, '-')
    if (daysText && !/^-?\d+$/.test(daysText)) {
      setError(t.money.daysInvalid(CHANGE_DAYS_MAX))
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
    <Dialog title={t.money.newChangeOrder} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <TextField
          label={t.common.title}
          value={title}
          onChange={setTitle}
          maxLength={TITLE_MAX}
          placeholder={t.money.changeTitlePlaceholder}
        />
        <TextAreaField
          label={t.money.whatChanges}
          value={description}
          onChange={setDescription}
          maxLength={DESCRIPTION_MAX}
          placeholder={t.money.whatChangesPlaceholder}
        />
        <div className="form-row">
          <MoneyField
            label={t.money.priceChange}
            value={amount}
            onChange={setAmount}
            currency={project.currency}
            hint={t.money.priceChangeHint}
          />
          <TextField
            label={t.money.scheduleChange}
            extra={t.money.daysExtra}
            value={days}
            onChange={setDays}
            inputMode="numeric"
            placeholder="0"
          />
        </div>
        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? t.common.sending : t.money.sendToClient}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function InvoiceDialog({ project, onDone, onClose }: DialogProps) {
  const t = useT()
  const left = project.money.leftToInvoice
  const [title, setTitle] = useState(project.invoices.length === 0 ? t.money.deposit : '')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(isoDate(14))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cents = parseMoney(amount)
    if (cents === null || cents <= 0) {
      setError(t.money.enterAmount)
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
    <Dialog title={t.money.newInvoice} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <TextField
          label={t.money.whatFor}
          value={title}
          onChange={setTitle}
          maxLength={TITLE_MAX}
          placeholder={t.money.whatForPlaceholder}
        />
        <div className="form-row">
          <MoneyField
            label={t.money.amount}
            value={amount}
            onChange={setAmount}
            currency={project.currency}
            hint={fill(t.money.notInvoicedHint, {
              amount: formatMoney(left, project.currency),
              button: (
                <button type="button" className="text-button" onClick={() => setAmount(moneyInputValue(left))}>
                  {t.money.billAll}
                </button>
              ),
            })}
          />
          <TextField label={t.money.due} type="date" value={dueDate} onChange={setDueDate} />
        </div>
        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? t.common.sending : t.money.sendInvoice}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
