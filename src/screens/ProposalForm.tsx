import { useState } from 'react'
import type { FormEvent } from 'react'
import { parseMoney } from '../../shared/money'
import { DESCRIPTION_MAX, NAME_MAX, PLACE_MAX, TITLE_MAX } from '../../shared/rules'
import { api } from '../api'
import { StageListEditor } from '../components/StageListEditor'
import { BackLink, FormError, MoneyField, PageHeader, TextAreaField, TextField } from '../components/ui'
import { navigate } from '../router'

/**
 * A builder proposes a project to a client: the work, its price and stages. A client without an
 * account gets an email with a link to sign up and see it.
 */
export function ProposalForm() {
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [price, setPrice] = useState('')
  const [startDate, setStartDate] = useState('')
  const [stages, setStages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const contractAmount = parseMoney(price)
    if (contractAmount === null || contractAmount <= 0) {
      setError('Enter the price for the work, like 46,800.')
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
        contractAmount,
        startDate: startDate || null,
        stages,
      })
      navigate(`/projects/${project.id}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <BackLink to="/projects">Projects</BackLink>
      <PageHeader
        title="Send a proposal"
        subtitle="For work you've already talked through with a client. They accept it on Casa Fida, and the project starts."
      />
      <form className="card form form--narrow" onSubmit={handleSubmit} noValidate>
        <h2 className="form__section">Your client</h2>
        <div className="form-row">
          <TextField label="Name" value={clientName} onChange={setClientName} maxLength={NAME_MAX} required />
          <TextField
            label="Email"
            type="email"
            value={clientEmail}
            onChange={setClientEmail}
            hint="If they're new to Casa Fida, we'll email them a link to sign up and see it."
            required
          />
        </div>

        <h2 className="form__section">The work</h2>
        <TextField
          label="Title"
          value={title}
          onChange={setTitle}
          maxLength={TITLE_MAX}
          placeholder="Kitchen remodel"
          required
        />
        <TextAreaField
          label="What's included"
          value={description}
          onChange={setDescription}
          maxLength={DESCRIPTION_MAX}
          rows={6}
          placeholder="The scope of work, materials, allowances, and anything that isn't included."
          required
        />
        <TextField
          label="Address"
          extra="(optional)"
          value={address}
          onChange={setAddress}
          maxLength={PLACE_MAX}
          autoComplete="street-address"
        />
        <div className="form-row">
          <MoneyField label="Price" value={price} onChange={setPrice} required />
          <TextField label="Start date" extra="(optional)" type="date" value={startDate} onChange={setStartDate} />
        </div>
        <StageListEditor value={stages} onChange={setStages} />

        <FormError error={error} />
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={() => window.history.back()}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send proposal'}
          </button>
        </div>
      </form>
    </>
  )
}
