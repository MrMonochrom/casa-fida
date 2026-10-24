import { TRADE_KEYS } from '../../shared/rules'
import type { Trade } from '../../shared/rules'
import { useT } from '../i18n'

interface Props {
  value: Trade[]
  onChange: (trades: Trade[]) => void
  /** How many the builder's plan allows. */
  max: number
}

/**
 * Toggle buttons for the trades a builder offers, up to what their plan allows. A builder whose Pro
 * has ended can have more: only the first ones they chose count, so it says which don't.
 */
export function TradePicker({ value, onChange, max }: Props) {
  const t = useT()
  const full = value.length >= max
  const paused = value.slice(max)

  function toggle(trade: Trade) {
    onChange(value.includes(trade) ? value.filter((t) => t !== trade) : [...value, trade])
  }

  return (
    <fieldset className="field">
      <legend className="field__label">
        {t.profileForm.trades} <span className="field__extra">{t.profileForm.upTo(max)}</span>
      </legend>
      {paused.length > 0 && (
        <p className="notice" role="status">
          {t.profileForm.overLimit(max, paused.map((trade) => t.trades[trade]).join(', '))}
        </p>
      )}
      <div className="chips">
        {TRADE_KEYS.map((trade) => {
          const on = value.includes(trade)
          return (
            <button
              key={trade}
              type="button"
              className={`chip ${on ? 'chip--on' : ''}`}
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(trade)}
            >
              {t.trades[trade]}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
