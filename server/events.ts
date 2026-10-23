// Live updates for people with the app open (see GET /api/events). Kept in this server's memory,
// which works for one server process.

/**
 * message: a new message. read: your messages were read.
 * project: something on a project changed. job: a quote on a job changed, or the job did.
 */
export type AppEvent =
  | { type: 'message' | 'read'; conversationId: number }
  | { type: 'project'; projectId: number }
  | { type: 'job'; jobId: number }

type Listener = (event: AppEvent) => void

const listeners = new Map<number, Set<Listener>>()

/** Calls `listener` with every event for this user, until the returned function is called. */
export function subscribe(userId: number, listener: Listener): () => void {
  let forUser = listeners.get(userId)
  if (!forUser) listeners.set(userId, (forUser = new Set()))
  forUser.add(listener)
  return () => {
    forUser.delete(listener)
    if (forUser.size === 0) listeners.delete(userId)
  }
}

export function publish(userId: number | null | undefined, event: AppEvent) {
  if (!userId) return
  for (const listener of listeners.get(userId) ?? []) listener(event)
}

/** True while the person has the app open somewhere. */
export function isOnline(userId: number): boolean {
  return listeners.has(userId)
}
