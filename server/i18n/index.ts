// The server answers in the language the app is showing. Messages are written as functions that
// pick a text from a language's messages, like (m) => m.jobs.enterTitle, and are put into words
// only when the answer is sent.
import type { Request } from 'express'
import { LANGUAGE_COOKIE, acceptedLanguages, isLanguage, pickLanguage } from '../../shared/languages.ts'
import type { Language } from '../../shared/languages.ts'
import { cookie } from '../cookies.ts'
import { en } from './en.ts'
import type { ServerMessages } from './en.ts'
import { ro } from './ro.ts'
import { ru } from './ru.ts'

export type { ServerMessages }

const MESSAGES: Record<Language, ServerMessages> = { en, ro, ru }

/** Something to tell the person using the app, in whichever language they read. */
export type Text = (m: ServerMessages) => string

/** The language a request wants: the app's cookie, else the browser's Accept-Language, else English. */
export function languageOf(req: Request): Language {
  return chosenLanguage(req) ?? pickLanguage(acceptedLanguages(req.headers['accept-language']))
}

/** The language the app says it's showing, if the request says (the app's cookie). */
export function chosenLanguage(req: Request): Language | null {
  const chosen = cookie(req, LANGUAGE_COOKIE)
  return isLanguage(chosen) ? chosen : null
}

/** Every message in one language. */
export const messagesIn = (language: Language): ServerMessages => MESSAGES[language]

/** A text in the request's language. */
export const say = (req: Request, text: Text): string => text(MESSAGES[languageOf(req)])

/** A text in English, for logs. */
export const inEnglish = (text: Text): string => text(en)
