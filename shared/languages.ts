// The languages the app and the server speak. The app keeps the choice in a cookie, so the server
// answers in the same language.

/** Each language's own name for itself, as shown in the language picker. */
export const LANGUAGES = {
  en: 'English',
  ro: 'Română',
  ru: 'Русский',
} as const
export type Language = keyof typeof LANGUAGES
export const LANGUAGE_KEYS = Object.keys(LANGUAGES) as Language[]
export const isLanguage = (value: unknown): value is Language => typeof value === 'string' && value in LANGUAGES

/** The cookie that tells the server which language to answer in. */
export const LANGUAGE_COOKIE = 'cf_lang'

/** For formatting dates and numbers in each language. */
export const LOCALES: Record<Language, string> = {
  en: 'en-US',
  ro: 'ro-RO',
  ru: 'ru-RU',
}

/**
 * The first language we speak from a list of preferences, like navigator.languages or the
 * Accept-Language header: ['ro-MD', 'en'] → 'ro'. English when none match.
 */
export function pickLanguage(preferences: readonly string[]): Language {
  for (const preference of preferences) {
    const base = preference.trim().toLowerCase().split(/[-_;]/)[0]
    // Moldovan is Romanian.
    if (base === 'mo') return 'ro'
    if (isLanguage(base)) return base
  }
  return 'en'
}

/** The languages in an Accept-Language header, most wanted first. */
export function acceptedLanguages(header: string | undefined): string[] {
  if (!header) return []
  return header
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean)
      return { tag: tag.trim(), q: q === undefined ? 1 : Number(q), i }
    })
    .filter((l) => l.tag && l.tag !== '*' && l.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map((l) => l.tag)
}

// Each language has its own rules for which form of a word goes with a number.
const romanianRules = new Intl.PluralRules('ro')
const russianRules = new Intl.PluralRules('ru')

/** English: 1 quote, 2 quotes. */
export const pluralEn = (n: number, one: string, other: string) => (n === 1 ? one : other)

/** Romanian: 1 ofertă, 2 oferte (also 0 and 2–19), 20 de oferte. */
export function pluralRo(n: number, one: string, few: string, other: string) {
  const form = romanianRules.select(n)
  return form === 'one' ? one : form === 'few' ? few : other
}

/** Russian: 1 смета (also 21), 2 сметы (also 3, 4, 22), 5 смет (also 0, 11, 25). */
export function pluralRu(n: number, one: string, few: string, many: string) {
  const form = russianRules.select(n)
  return form === 'one' ? one : form === 'few' ? few : many
}
