import { CURRENCIES } from '../../shared/money'
import type { Currency } from '../../shared/money'
import { currencyName } from '../format'
import { useT } from '../i18n'
import { SelectField } from './ui'

interface Props {
  value: Currency
  onChange: (currency: Currency) => void
  disabled?: boolean
  hint?: string
}

/** Choosing what a job or project is priced in: "US dollar (USD)", "Euro (EUR)"… */
export function CurrencyField({ value, onChange, disabled, hint }: Props) {
  const t = useT()
  return (
    <SelectField
      label={t.common.currency}
      value={value}
      onChange={(v) => onChange(v as Currency)}
      disabled={disabled}
      hint={hint}
    >
      {CURRENCIES.map((currency) => (
        <option key={currency} value={currency}>
          {currencyName(currency)}
        </option>
      ))}
    </SelectField>
  )
}
