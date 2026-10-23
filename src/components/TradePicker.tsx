import { MAX_TRADES, TRADE_KEYS } from '../../shared/rules'
import type { Trade } from '../../shared/rules'
import { useT } from '../i18n'

interface Props {
  value: Trade[]
  onChange: (trades: Trade[]) => void
}

/** Toggle buttons for the trades a builder offers, up to MAX_TRADES. */
export function TradePicker({ value, onChange }: Props) {
  const t = useT()
  const full = value.length >= MAX_TRADES

  function toggle(trade: Trade) {
    onChange(value.includes(trade) ? value.filter((t) => t !== trade) : [...value, trade])
  }

  return (
    <fieldset className="field">
      <legend className="field__label">
        {t.profileForm.trades} <span className="field__extra">{t.profileForm.upTo(MAX_TRADES)}</span>
      </legend>
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
