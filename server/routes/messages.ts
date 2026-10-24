import express from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { MESSAGE_MAX } from '../../shared/rules.ts'
import { builderKnowsClient, ensureConversation } from '../conversations.ts'
import { db, ms } from '../db.ts'
import { notFound } from '../errors.ts'
import type { Text } from '../i18n/index.ts'
import { isOnline, publish } from '../events.ts'
import { notify } from '../notifications.ts'
import { displayName } from '../users.ts'
import { me, requireUser } from '../session.ts'
import type { UserRow } from '../users.ts'
import { badRequest, fail, idFrom, longText } from '../validate.ts'

export const messageRoutes = express.Router()

/** The most messages one request returns. The app asks again for the rest. */
const MESSAGES_PER_REQUEST = 500
const CONVERSATION_GONE: Text = (m) => m.messages.gone

interface ConversationRow extends RowDataPacket {
  id: number
  other_id: number
  other_name: string
  other_role: 'client' | 'builder'
  business_name: string | null
  last_body: string | null
  last_sender: number | null
  last_sent_at: number | null
  unread: number
}

/** The logged-in person's conversations, most recent activity first. Pass id to get just one. */
async function conversationsOf(user: UserRow, id?: number) {
  const mine = user.role === 'client' ? 'client_id' : 'builder_id'
  const theirs = user.role === 'client' ? 'builder_id' : 'client_id'
  const [rows] = await db.execute<ConversationRow[]>(
    `SELECT c.id, o.id AS other_id, o.name AS other_name, o.role AS other_role, b.business_name,
            lm.body AS last_body, lm.sender_id AS last_sender, ${ms('lm.sent_at')} AS last_sent_at,
            (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = c.id AND x.sender_id <> ? AND x.read_at IS NULL) AS unread
     FROM conversations c
     JOIN users o ON o.id = c.${theirs}
     LEFT JOIN builder_profiles b ON b.user_id = o.id
     LEFT JOIN messages lm ON lm.id = (SELECT MAX(id) FROM messages WHERE conversation_id = c.id)
     WHERE c.${mine} = ? ${id ? 'AND c.id = ?' : ''}
     ORDER BY COALESCE(lm.sent_at, c.created_at) DESC, c.id DESC`,
    id ? [user.id, user.id, id] : [user.id, user.id],
  )
  return rows.map((r) => ({
    id: r.id,
    other: { id: r.other_id, name: r.other_name, role: r.other_role, businessName: r.business_name },
    lastMessage:
      r.last_body === null
        ? null
        : { text: r.last_body, fromMe: r.last_sender === user.id, sentAt: Number(r.last_sent_at) },
    unread: Number(r.unread),
  }))
}

messageRoutes.get('/conversations', requireUser, async (_req, res) => {
  res.json({ conversations: await conversationsOf(me(res)) })
})

// Opens the conversation with someone, starting it if needed. Clients can message any builder with
// a profile; builders can message clients they've quoted for or have a project with.
messageRoutes.post('/conversations', requireUser, async (req, res) => {
  const user = me(res)
  const otherId = idFrom(req.body?.userId)
  const [rows] = otherId
    ? await db.execute<RowDataPacket[]>(
        `SELECT u.id, u.role, b.user_id IS NOT NULL AS has_profile
         FROM users u LEFT JOIN builder_profiles b ON b.user_id = u.id WHERE u.id = ?`,
        [otherId],
      )
    : [[]]
  const other = (rows as RowDataPacket[])[0]
  if (!other) return fail(res, 404, (m) => m.messages.personGone)
  if (other.role === user.role) {
    return badRequest(res, user.role === 'client' ? (m) => m.messages.clientsMessageBuilders : (m) => m.messages.buildersMessageClients)
  }
  let conversationId: number
  if (user.role === 'client') {
    if (!other.has_profile) return fail(res, 404, (m) => m.builders.noProfileYet)
    conversationId = await ensureConversation(user.id, other.id)
  } else {
    if (!(await builderKnowsClient(user.id, other.id))) {
      return fail(res, 403, (m) => m.messages.notYet)
    }
    conversationId = await ensureConversation(other.id, user.id)
  }
  res.json({ conversation: (await conversationsOf(user, conversationId))[0] })
})

/** The conversation, if the logged-in person is in it. */
async function conversationFor(user: UserRow, id: unknown) {
  const conversationId = idFrom(id)
  const found = conversationId ? (await conversationsOf(user, conversationId))[0] : undefined
  if (!found) throw notFound(CONVERSATION_GONE)
  return found
}

interface MessageRow extends RowDataPacket {
  id: number
  sender_id: number
  body: string
  sent_at: number
}

const MESSAGE_COLUMNS = `id, sender_id, body, ${ms('sent_at')} AS sent_at`

function toMessage(row: MessageRow, meId: number) {
  return { id: row.id, fromMe: row.sender_id === meId, text: row.body, sentAt: Number(row.sent_at) }
}

// Messages in a conversation, oldest first. ?after=<message id> returns only newer ones (used for
// checking for new messages). seenUpTo is the newest of your messages the other person has read.
messageRoutes.get('/conversations/:id/messages', requireUser, async (req, res) => {
  const user = me(res)
  const conversation = await conversationFor(user, req.params.id)
  const [rows] = await db.execute<MessageRow[]>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT ${MESSAGES_PER_REQUEST}`,
    [conversation.id, idFrom(req.query.after) ?? 0],
  )
  if (rows.some((r) => r.sender_id !== user.id)) {
    // Only what's returned now counts as read. Anything past the limit arrives with the next request.
    const [marked] = await db.execute<ResultSetHeader>(
      'UPDATE messages SET read_at = NOW() WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL AND id <= ?',
      [conversation.id, user.id, rows[rows.length - 1].id],
    )
    if (marked.affectedRows > 0) publish(conversation.other.id, { type: 'read', conversationId: conversation.id })
  }
  const [seen] = await db.execute<RowDataPacket[]>(
    'SELECT MAX(id) AS id FROM messages WHERE conversation_id = ? AND sender_id = ? AND read_at IS NOT NULL',
    [conversation.id, user.id],
  )
  res.json({
    conversation: { ...conversation, unread: 0 },
    messages: rows.map((r) => toMessage(r, user.id)),
    seenUpTo: seen[0].id ?? null,
  })
})

messageRoutes.post('/conversations/:id/messages', requireUser, async (req, res) => {
  const user = me(res)
  const body = longText(req.body?.text)
  if (!body) return badRequest(res, (m) => m.messages.enterText)
  if (body.length > MESSAGE_MAX) return badRequest(res, (m) => m.messages.tooLong)
  const conversation = await conversationFor(user, req.params.id)
  // Whether they already have unread messages from you here: then they've been told once already.
  const [waiting] = await db.execute<RowDataPacket[]>(
    'SELECT 1 FROM messages WHERE conversation_id = ? AND sender_id = ? AND read_at IS NULL LIMIT 1',
    [conversation.id, user.id],
  )

  const [result] = await db.execute<ResultSetHeader>(
    'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)',
    [conversation.id, user.id, body],
  )
  const [rows] = await db.execute<MessageRow[]>(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE id = ?`, [result.insertId])
  publish(conversation.other.id, { type: 'message', conversationId: conversation.id })
  // An email for the first message they haven't read, if they're away and you've confirmed your
  // address. Not the message itself: it's read in the app.
  if (waiting.length === 0 && !isOnline(conversation.other.id) && user.email_verified_at) {
    const name = await displayName(user.id)
    notify(conversation.other.id, 'messages', (m) => m.message(name), `/messages/${conversation.id}`)
  }
  res.status(201).json({ message: toMessage(rows[0], user.id) })
})
