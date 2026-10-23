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

interface Subscription {
  listener: Listener
  /** The hash of the login session it belongs to, so logging out can end it. */
  session: string
  /** Ends the connection. */
  close: () => void
}

/** The most open connections one person can have: tabs, phones and computers together. */
export const MAX_STREAMS_PER_USER = 10

const subscriptions = new Map<number, Set<Subscription>>()

/** Calls `listener` with every event for this user, until the returned function is called. */
export function subscribe(
  userId: number,
  listener: Listener,
  { session = '', close = () => {} }: { session?: string; close?: () => void } = {},
): () => void {
  let forUser = subscriptions.get(userId)
  if (!forUser) subscriptions.set(userId, (forUser = new Set()))
  const subscription = { listener, session, close }
  forUser.add(subscription)
  return () => {
    forUser.delete(subscription)
    if (forUser.size === 0) subscriptions.delete(userId)
  }
}

export function publish(userId: number | null | undefined, event: AppEvent) {
  if (!userId) return
  for (const { listener } of subscriptions.get(userId) ?? []) listener(event)
}

/** True while the person has the app open somewhere. */
export function isOnline(userId: number): boolean {
  return subscriptions.has(userId)
}

/** How many connections the person has open. */
export const streamCount = (userId: number) => subscriptions.get(userId)?.size ?? 0

/**
 * Ends live updates for logins that just ended: one session (logging out), or every session of a
 * person but the one they're using (a password change).
 */
export function closeStreams(userId: number, which: { session: string } | { except: string }) {
  for (const subscription of [...(subscriptions.get(userId) ?? [])]) {
    const ended = 'session' in which ? subscription.session === which.session : subscription.session !== which.except
    if (ended) subscription.close()
  }
}
