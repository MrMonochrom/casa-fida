// A small router on top of the browser's history, so every screen has its own address (links in
// emails like /projects/12 open the right page) and Back works as expected.
import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

/** Goes to another page of the app. */
export function navigate(to: string, { replace = false } = {}) {
  if (to === window.location.pathname + window.location.search) return
  if (replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  window.scrollTo(0, 0)
  for (const listener of listeners) listener()
}

/** The current path, like "/projects/12". The component re-renders when it changes. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

/** The current query string's values. */
export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, () => window.location.search)
  return new URLSearchParams(search)
}

/**
 * Matches a path against a pattern like "/projects/:id". Returns the named parts, or null.
 * Numeric-looking parts stay strings; use idParam to read ids.
 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean)
  const have = path.split('/').filter(Boolean)
  if (want.length !== have.length) return null
  const params: Record<string, string> = {}
  for (const [i, part] of want.entries()) {
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(have[i])
    else if (part !== have[i]) return null
  }
  return params
}

/** A positive whole number from a path part, or null. */
export function idParam(value: string | undefined): number | null {
  return value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null
}
