// New jobs and proposals start in the currency last used on this device.
import { DEFAULT_CURRENCY, isCurrency } from '../shared/money'
import type { Currency } from '../shared/money'

const STORAGE_KEY = 'cf_currency'

export function preferredCurrency(): Currency {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return isCurrency(saved) ? saved : DEFAULT_CURRENCY
  } catch {
    return DEFAULT_CURRENCY
  }
}

export function rememberCurrency(currency: Currency) {
  try {
    localStorage.setItem(STORAGE_KEY, currency)
  } catch {
    // Private browsing can refuse storage; the next form starts from the default instead.
  }
}
