import { useEffect, useRef } from 'react'
import type { AppEvent } from './types'

type Listener = (event: AppEvent) => void

const TYPES: AppEvent['type'][] = ['message', 'read', 'project', 'job']
const listeners = new Set<Listener>()
let source: EventSource | null = null

/**
 * Listens for live updates from the server (new and read messages, changes to projects and jobs).
 * The whole app shares one connection, opened with the first listener and closed with the last.
 * The browser reconnects by itself if it drops. Returns a function that stops listening.
 */
export function subscribeToServerEvents(listener: Listener): () => void {
  listeners.add(listener)
  if (!source && typeof EventSource !== 'undefined') {
    source = new EventSource('/api/events')
    for (const type of TYPES) {
      source.addEventListener(type, (message) => {
        const event = JSON.parse((message as MessageEvent).data) as AppEvent
        for (const each of listeners) each(event)
      })
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && source) {
      source.close()
      source = null
    }
  }
}

/** Calls `listener` with every live update while the component is on screen. */
export function useServerEvents(listener: Listener) {
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  })
  useEffect(() => subscribeToServerEvents((event) => latest.current(event)), [])
}
