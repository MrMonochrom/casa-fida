import { MAX_TRADES, TRADES, TRADE_KEYS } from '../../shared/rules'
import type { Trade } from '../../shared/rules'

interface Props {
  value: Trade[]
  onChange: (trades: Trade[]) => void
}

/** Toggle buttons for the trades a builder offers, up to MAX_TRADES. */
export function TradePicker({ value, onChange }: Props) {
  const full = value.length >= MAX_TRADES

  function toggle(trade: Trade) {
    onChange(value.includes(trade) ? value.filter((t) => t !== trade) : [...value, trade])
  }

  return (
    <fieldset className="field">
      <legend className="field__label">
        Trades you offer <span className="field__extra">(up to {MAX_TRADES})</span>
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
              {TRADES[trade]}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
