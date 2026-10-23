// The app's language: English, Romanian or Russian. The choice is kept in this browser and sent to
// the server in a cookie, so its messages and emails come back in the same language. Until someone
// chooses, the browser's own languages decide.
import { Fragment, createElement, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { LANGUAGE_COOKIE, LOCALES, isLanguage, pickLanguage } from '../../shared/languages'
import type { Language } from '../../shared/languages'
import { en } from './en'
import type { Messages } from './en'
import { ro } from './ro'
import { ru } from './ru'

export type { Messages }

const MESSAGES: Record<Language, Messages> = { en, ro, ru }
const STORAGE_KEY = 'cf_lang'

function chosenBefore(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isLanguage(value) ? value : null
  } catch {
    return null
  }
}

function browserLanguage(): Language {
  return pickLanguage(navigator.languages?.length ? navigator.languages : [navigator.language ?? ''])
}

let current: Language = chosenBefore() ?? browserLanguage()
const listeners = new Set<() => void>()

/** Tells the page and the server which language is showing. */
function announce() {
  document.documentElement.lang = current
  document.cookie = `${LANGUAGE_COOKIE}=${current}; path=/; max-age=31536000; samesite=lax`
}
announce()

/** Switches the whole app to another language, and remembers it in this browser. */
export function setLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Private browsing can refuse storage; the language still changes until the page reloads.
  }
  if (language === current) return
  current = language
  announce()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getLanguage = (): Language => current

/** The current language's words, for code outside components (components use useT). */
export const getT = (): Messages => MESSAGES[current]

/** For formatting dates and numbers: 'en-US', 'ro-RO' or 'ru-RU'. */
export const getLocale = (): string => LOCALES[current]

/** The current language. The component re-renders when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage)
}

/** The current language's words: const t = useT(), then t.nav.home. */
export function useT(): Messages {
  return MESSAGES[useLanguage()]
}

/**
 * Puts elements into a text's {name} slots, so word order can differ between languages:
 * fill('You hired {builder}.', { builder: <strong>Reid & Sons</strong> })
 */
export function fill(text: string, values: Record<string, ReactNode>): ReactNode[] {
  return text.split(/\{(\w+)\}/).map((part, i) => (i % 2 ? createElement(Fragment, { key: i }, values[part]) : part))
}
