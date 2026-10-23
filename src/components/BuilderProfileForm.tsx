import { useState } from 'react'
import type { FormEvent } from 'react'
import { ABOUT_MAX, BUSINESS_NAME_MAX, HEADLINE_MAX, PLACE_MAX } from '../../shared/rules'
import type { Trade } from '../../shared/rules'
import { api } from '../api'
import type { User } from '../types'
import { TradePicker } from './TradePicker'
import { FormError, TextAreaField, TextField } from './ui'

interface Props {
  user: User
  onSaved: (user: User) => void
  submitLabel: string
}

/** A builder's public business profile: what clients see in search and on their page. */
export function BuilderProfileForm({ user, onSaved, submitLabel }: Props) {
  const profile = user.builderProfile
  const [businessName, setBusinessName] = useState(profile?.businessName ?? '')
  const [headline, setHeadline] = useState(profile?.headline ?? '')
  const [about, setAbout] = useState(profile?.about ?? '')
  const [serviceArea, setServiceArea] = useState(profile?.serviceArea ?? '')
  const [years, setYears] = useState(profile?.yearsInBusiness?.toString() ?? '')
  const [licenseNumber, setLicenseNumber] = useState(profile?.licenseNumber ?? '')
  const [insured, setInsured] = useState(profile?.insured ?? false)
  const [trades, setTrades] = useState<Trade[]>(profile?.trades ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const yearsText = years.trim()
    if (yearsText && !/^\d+$/.test(yearsText)) {
      setError('Years in business should be a whole number.')
      return
    }
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await api.saveBuilderProfile({
        businessName,
        headline,
        about,
        serviceArea,
        yearsInBusiness: yearsText ? Number(yearsText) : null,
        licenseNumber: licenseNumber.trim() || null,
        insured,
        trades,
      })
      setSaved(true)
      onSaved(updated)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <TextField
        label="Business name"
        value={businessName}
        onChange={setBusinessName}
        maxLength={BUSINESS_NAME_MAX}
        autoComplete="organization"
        required
      />
      <TextField
        label="Headline"
        extra="(optional)"
        value={headline}
        onChange={setHeadline}
        maxLength={HEADLINE_MAX}
        placeholder="Kitchens and bathrooms, designed and built by one team."
        hint="One line under your name in search results."
      />
      <TextAreaField
        label="About your business"
        value={about}
        onChange={setAbout}
        maxLength={ABOUT_MAX}
        rows={5}
        placeholder="Your team, how you work, what clients can expect."
        required
      />
      <div className="form-row">
        <TextField
          label="Area you work in"
          value={serviceArea}
          onChange={setServiceArea}
          maxLength={PLACE_MAX}
          placeholder="Denver, CO"
          required
        />
        <TextField
          label="Years in business"
          extra="(optional)"
          value={years}
          onChange={setYears}
          inputMode="numeric"
        />
      </div>
      <TradePicker value={trades} onChange={setTrades} />
      <div className="form-row">
        <TextField
          label="License number"
          extra="(optional)"
          value={licenseNumber}
          onChange={setLicenseNumber}
          maxLength={60}
          hint="Clients see a “Licensed” badge."
        />
        <div className="field field--checkbox">
          <label className="checkbox">
            <input type="checkbox" checked={insured} onChange={(e) => setInsured(e.target.checked)} />
            <span>We carry liability insurance</span>
          </label>
        </div>
      </div>
      <FormError error={error} />
      {saved && !error && (
        <p className="form-success" role="status">
          Saved.
        </p>
      )}
      <div className="form-actions form-actions--start">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
