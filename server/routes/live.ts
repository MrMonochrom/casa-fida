import express from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import { hashToken } from '../auth.ts'
import { db } from '../db.ts'
import { MAX_STREAMS_PER_USER, streamCount, subscribe } from '../events.ts'
import { currentUser, me, requireUser, sessionToken } from '../session.ts'
import { fail } from '../validate.ts'

export const liveRoutes = express.Router()

// How often to send something on an idle connection, so proxies don't close it.
const HEARTBEAT_MS = 25_000

// Live updates while the app is open (server-sent events): new messages, read messages, and changes
// to projects and jobs, as they happen. The browser reconnects by itself if the connection drops.
// They end with the login: on logging out or a password change straight away, and when the session
// expires at the next heartbeat.
liveRoutes.get('/events', requireUser, (req, res) => {
  const userId = me(res).id
  if (streamCount(userId) >= MAX_STREAMS_PER_USER) return fail(res, 429, (m) => m.general.tooManyConnections)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tells proxies such as nginx not to hold events back.
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 5000\n\n')
  const unsubscribe = subscribe(
    userId,
    (event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    },
    { session: hashToken(sessionToken(req) ?? ''), close: () => res.end() },
  )
  const heartbeat = setInterval(async () => {
    const user = await currentUser(req).catch(() => undefined)
    // undefined: the database didn't answer. Keep going; the next heartbeat checks again.
    if (user === null || (user && user.id !== userId)) res.end()
    else res.write(': still here\n\n')
  }, HEARTBEAT_MS)
  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})

// The numbers on the menu badges.
// unreadMessages: messages you haven't read.
// projects: for clients, proposals, change orders and invoices waiting for you.
// jobs: for clients, quotes waiting for an answer; for builders, open jobs in your trades you haven't quoted on.
liveRoutes.get('/summary', requireUser, async (_req, res) => {
  const user = me(res)
  const column = user.role === 'client' ? 'client_id' : 'builder_id'
  const [rows] = await db.execute<RowDataPacket[]>(
    user.role === 'client'
      ? `SELECT
           (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
            WHERE c.${column} = ? AND m.sender_id <> ? AND m.read_at IS NULL) AS unread_messages,
           (SELECT COUNT(*) FROM projects WHERE client_id = ? AND status = 'proposed')
           + (SELECT COUNT(*) FROM change_orders c JOIN projects p ON p.id = c.project_id
              WHERE p.client_id = ? AND p.status = 'active' AND c.status = 'pending')
           + (SELECT COUNT(*) FROM invoices i JOIN projects p ON p.id = i.project_id
              WHERE p.client_id = ? AND i.status = 'due') AS projects,
           (SELECT COUNT(*) FROM quotes q JOIN jobs j ON j.id = q.job_id
            WHERE j.client_id = ? AND j.status = 'open' AND q.status = 'pending') AS jobs`
      : `SELECT
           (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
            WHERE c.${column} = ? AND m.sender_id <> ? AND m.read_at IS NULL) AS unread_messages,
           0 AS projects,
           (SELECT COUNT(*) FROM jobs j
            WHERE j.status = 'open' AND j.trade IN (SELECT trade FROM builder_trades WHERE user_id = ?)
              AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.job_id = j.id AND q.builder_id = ?)) AS jobs`,
    user.role === 'client' ? Array(6).fill(user.id) : Array(4).fill(user.id),
  )
  res.json({
    unreadMessages: Number(rows[0].unread_messages),
    projects: Number(rows[0].projects),
    jobs: Number(rows[0].jobs),
  })
})
