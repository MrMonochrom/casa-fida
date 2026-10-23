import { useCallback, useEffect, useRef, useState } from 'react'

interface State<T> {
  key: string
  data?: T
  error: string | null
}

/**
 * Loads something from the API when the component appears and whenever `key` changes.
 * `reload` loads it again (after a live update, say) without blanking what's on screen, and
 * `setData` puts in a fresh copy the server sent back after a change. Answers that arrive after
 * a newer request has started are ignored, so a slow response can't overwrite a newer one.
 */
export function useResource<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<State<T>>({ key, error: null })
  const latestLoad = useRef(load)
  const latestKey = useRef(key)
  const requests = useRef(0)

  useEffect(() => {
    latestLoad.current = load
    latestKey.current = key
  })

  const reload = useCallback(async () => {
    const request = ++requests.current
    const forKey = latestKey.current
    try {
      const data = await latestLoad.current()
      if (request === requests.current) setState({ key: forKey, data, error: null })
    } catch (err) {
      if (request === requests.current) {
        // Keeps what's on screen if it's for the same key, so a failed refresh doesn't blank the page.
        setState((current) => ({
          key: forKey,
          data: current.key === forKey ? current.data : undefined,
          error: (err as Error).message,
        }))
      }
    }
  }, [])

  useEffect(() => {
    reload()
  }, [key, reload])

  const setData = useCallback((data: T) => {
    requests.current++
    setState({ key: latestKey.current, data, error: null })
  }, [])

  // Data for a different key (the page moved to another project, say) isn't shown.
  const current = state.key === key
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : null,
    reload,
    setData,
  }
}
