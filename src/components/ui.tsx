// Small building blocks used across the app.
import { useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import type { Currency } from '../../shared/money'
import { currencySign, initials, ratingText } from '../format'
import { getLocale, useT } from '../i18n'
import type { StatusLook } from '../format'
import { Link } from './Link'

/** A coloured pill like "In progress" or "Overdue". */
export function StatusPill({ look }: { look: StatusLook }) {
  return <span className={`pill pill--${look.tone}`}>{look.label}</span>
}

/** A small count on a menu item or tab. */
export function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null
  return (
    <span className="count" aria-label={label}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** ★★★★☆ 4.5 (12 reviews), or "No reviews yet". */
export function Rating({ rating, count, compact = false }: { rating: number | null; count: number; compact?: boolean }) {
  const t = useT()
  if (rating === null || count === 0) return <span className="rating rating--none">{t.ui.noReviews}</span>
  return (
    <span className="rating" aria-label={t.ui.rated(rating.toLocaleString(getLocale(), { maximumFractionDigits: 1 }), count)}>
      <Stars value={rating} />
      <strong>{ratingText(rating)}</strong>
      {!compact && <span className="muted">({count})</span>}
    </span>
  )
}

/** Five stars, filled up to `value`: 4.5 shows four and a half. */
export function Stars({ value }: { value: number }) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100))
  return (
    <span className="stars" aria-hidden="true">
      <span className="stars__empty">★★★★★</span>
      <span className="stars__filled" style={{ width: `${percent}%` }}>
        ★★★★★
      </span>
    </span>
  )
}

/** Choosing 1 to 5 stars, as radio buttons so it works with a keyboard. */
export function StarInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const t = useT()
  const name = useId()
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <fieldset className="star-input" onMouseLeave={() => setHover(0)}>
      <legend className="field__label">{t.ui.yourRating}</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={n <= shown ? 'star-input__star star-input__star--on' : 'star-input__star'} onMouseEnter={() => setHover(n)}>
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="visually-hidden"
          />
          <span aria-hidden="true">★</span>
          <span className="visually-hidden">{t.ui.stars(n)}</span>
        </label>
      ))}
    </fieldset>
  )
}

/** A circle with someone's initials. */
export function Avatar({ name, size = 'medium' }: { name: string; size?: 'small' | 'medium' | 'large' }) {
  // The same name always gets the same colour.
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return (
    <span className={`avatar avatar--${size} avatar--c${hash % 6}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

/** An error message from the server, read out by screen readers. */
export function FormError({ error }: { error: string | null | undefined }) {
  if (!error) return null
  return (
    <p className="form-error" role="alert">
      {error}
    </p>
  )
}

/** Shown while a page loads, or instead of it if loading failed. */
export function Loading({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const t = useT()
  if (error) {
    return (
      <div className="state state--error" role="alert">
        <p>{error}</p>
        {onRetry && (
          <button type="button" className="button button--secondary" onClick={onRetry}>
            {t.common.tryAgain}
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" /> {t.common.loading}
    </div>
  )
}

/** A friendly message when a list has nothing in it yet. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children}
    </div>
  )
}

/** "← Projects": back to the list a page belongs to. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="back-link">
      <span aria-hidden="true">←</span> {children}
    </Link>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header__text">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  )
}

/** A bar showing how many of a project's stages are done. */
export function Progress({ done, total }: { done: number; total: number }) {
  const t = useT()
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="progress">
      <div
        className="progress__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t.ui.progress}
      >
        <div className="progress__fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="progress__text">
        {total === 0 ? t.ui.noStages : t.ui.stagesDone(done, total)}
      </span>
    </div>
  )
}

interface FieldProps {
  label: string
  hint?: ReactNode
  /** Shown after the label in lighter text, like "(optional)". */
  extra?: string
  children: (id: string, describedBy: string | undefined) => ReactNode
}

/** A label, the input itself and an optional hint underneath, wired together for screen readers. */
export function Field({ label, hint, extra, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {extra && <span className="field__extra"> {extra}</span>}
      </label>
      {children(id, hintId)}
      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  )
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: string
  hint?: ReactNode
  extra?: string
  value: string
  onChange: (value: string) => void
}

export function TextField({ label, hint, extra, value, onChange, className, ...input }: TextFieldProps) {
  return (
    <Field label={label} hint={hint} extra={extra}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          className={`input ${className ?? ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...input}
        />
      )}
    </Field>
  )
}

/** An amount of money, typed the way the app's language writes numbers. The form reads it with parseMoney from format.ts. */
export function MoneyField({
  label,
  hint,
  extra,
  value,
  onChange,
  currency,
  ...input
}: Omit<TextFieldProps, 'type' | 'inputMode'> & { currency: Currency }) {
  const sign = currencySign(currency)
  return (
    <Field label={label} hint={hint} extra={extra}>
      {(id, describedBy) => (
        <span className="money-input">
          <span className="money-input__sign" aria-hidden="true">
            {sign}
          </span>
          <input
            id={id}
            aria-describedby={describedBy}
            className="input"
            // Room for the sign: "$" or "MDL".
            style={{ paddingLeft: `calc(${sign.length}ch + 20px)` }}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            {...input}
          />
        </span>
      )}
    </Field>
  )
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  label: string
  hint?: ReactNode
  extra?: string
  value: string
  onChange: (value: string) => void
}

export function TextAreaField({ label, hint, extra, value, onChange, ...textarea }: TextAreaFieldProps) {
  return (
    <Field label={label} hint={hint} extra={extra}>
      {(id, describedBy) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          className="input textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          {...textarea}
        />
      )}
    </Field>
  )
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  label: string
  hint?: ReactNode
  extra?: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}

export function SelectField({ label, hint, extra, value, onChange, children, ...select }: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} extra={extra}>
      {(id, describedBy) => (
        <select
          id={id}
          aria-describedby={describedBy}
          className="input select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...select}
        >
          {children}
        </select>
      )}
    </Field>
  )
}
