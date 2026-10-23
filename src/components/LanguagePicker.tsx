import { LANGUAGES, LANGUAGE_KEYS } from '../../shared/languages'
import type { Language } from '../../shared/languages'
import { setLanguage, useLanguage, useT } from '../i18n'
import { Icon } from './Icon'

/**
 * A small menu for switching the app's language. Each language is named in itself; `compact`
 * shows a globe and short codes (EN, RO, RU) instead, for the top bar.
 */
export function LanguagePicker({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const t = useT()
  const language = useLanguage()
  const select = (
    <select
      className={`input select select--small ${compact ? '' : className}`}
      aria-label={t.language.label}
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
    >
      {LANGUAGE_KEYS.map((key) => (
        <option key={key} value={key} lang={key} title={compact ? LANGUAGES[key] : undefined}>
          {compact ? key.toUpperCase() : LANGUAGES[key]}
        </option>
      ))}
    </select>
  )
  if (!compact) return select
  return (
    <span className={`language-picker ${className}`}>
      <Icon name="globe" size={18} />
      {select}
    </span>
  )
}
