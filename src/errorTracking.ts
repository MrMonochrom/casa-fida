// Sends errors in the browser to Sentry, when the server is set up to track errors (SENTRY_DSN): it
// says where in a <meta name="error-tracking"> tag on the page (see server/app.ts). main.tsx loads
// this file only then, so people's browsers download Sentry only when it's used.
import { init } from '@sentry/browser'

interface Settings {
  dsn: string
  environment: string
  release?: string
}

/** The settings the server put on the page, or null if errors aren't tracked. */
export function errorTrackingSettings(doc: Document = document): Settings | null {
  const content = doc.querySelector<HTMLMetaElement>('meta[name="error-tracking"]')?.content
  if (!content) return null
  try {
    const settings = JSON.parse(content) as Settings
    return typeof settings.dsn === 'string' && settings.dsn ? settings : null
  } catch {
    return null
  }
}

/** An address without its query: links from emails carry tokens there (?token=…). */
export const withoutQuery = (url: string) => url.replace(/[?#].*$/, '')

/** Starts sending errors to Sentry, if the page says where. */
export function startErrorTracking(doc: Document = document) {
  const settings = errorTrackingSettings(doc)
  if (!settings) return false
  init({
    dsn: settings.dsn,
    environment: settings.environment,
    release: settings.release,
    // Nothing about the person: no cookies, headers, query values or local variables.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    beforeSend(event) {
      if (event.request?.url) event.request.url = withoutQuery(event.request.url)
      return event
    },
    beforeBreadcrumb(breadcrumb) {
      const data = breadcrumb.data
      if (data) {
        for (const key of ['url', 'from', 'to']) {
          if (typeof data[key] === 'string') data[key] = withoutQuery(data[key])
        }
      }
      return breadcrumb
    },
  })
  return true
}
