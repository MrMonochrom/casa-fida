import { useState } from 'react'
import type { FormEvent } from 'react'
import { parseMoney } from '../../shared/money'
import { DESCRIPTION_MAX, NAME_MAX, PLACE_MAX, TITLE_MAX } from '../../shared/rules'
import { api } from '../api'
import { CurrencyField } from '../components/CurrencyField'
import { StageListEditor } from '../components/StageListEditor'
import { BackLink, FormError, MoneyField, PageHeader, TextAreaField, TextField } from '../components/ui'
import { useT } from '../i18n'
import { preferredCurrency, rememberCurrency } from '../preferredCurrency'
import { navigate } from '../router'

/**
 * A builder proposes a project to a client: the work, its price and stages. A client without an
 * account gets an email with a link to sign up and see it.
 */
export function ProposalForm() {
  const t = useT()
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState(preferredCurrency)
  const [startDate, setStartDate] = useState('')
  const [stages, setStages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const contractAmount = parseMoney(price)
    if (contractAmount === null || contractAmount <= 0) {
      setError(t.projects.priceInvalid)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const project = await api.propose({
        clientName,
        clientEmail,
        title,
        description,
        address,
        currency,
        contractAmount,
        startDate: startDate || null,
        stages,
      })
      rememberCurrency(currency)
      navigate(`/projects/${project.id}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <BackLink to="/projects">{t.nav.projects}</BackLink>
      <PageHeader title={t.common.sendProposal} subtitle={t.projects.proposalSubtitle} />
      <form className="card form form--narrow" onSubmit={handleSubmit} noValidate>
        <h2 className="form__section">{t.common.yourClient}</h2>
        <div className="form-row">
          <TextField label={t.common.name} value={clientName} onChange={setClientName} maxLength={NAME_MAX} required />
          <TextField
            label={t.common.email}
            type="email"
            value={clientEmail}
            onChange={setClientEmail}
            hint={t.projects.emailHint}
            required
          />
        </div>

        <h2 className="form__section">{t.common.theWork}</h2>
        <TextField
          label={t.common.title}
          value={title}
          onChange={setTitle}
          maxLength={TITLE_MAX}
          placeholder={t.projects.titlePlaceholder}
          required
        />
        <TextAreaField
          label={t.common.whatsIncluded}
          value={description}
          onChange={setDescription}
          maxLength={DESCRIPTION_MAX}
          rows={6}
          placeholder={t.projects.includedPlaceholder}
          required
        />
        <TextField
          label={t.common.address}
          extra={t.common.optional}
          value={address}
          onChange={setAddress}
          maxLength={PLACE_MAX}
          autoComplete="street-address"
        />
        <div className="form-row">
          <MoneyField label={t.common.price} value={price} onChange={setPrice} currency={currency} required />
          <CurrencyField value={currency} onChange={setCurrency} />
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
        <StageListEditor value={stages} onChange={setStages} />

        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={() => window.history.back()}>
            {t.common.cancel}
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? t.common.sending : t.projects.sendProposal}
          </button>
        </div>
      </form>
    </>
  )
}
