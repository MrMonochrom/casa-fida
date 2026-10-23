import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { db } from './db.ts'

/** The conversation between a client and a builder, created if they don't have one yet. Returns its id. */
export async function ensureConversation(clientId: number, builderId: number, conn: Pool | PoolConnection = db) {
  await conn.execute('INSERT IGNORE INTO conversations (client_id, builder_id) VALUES (?, ?)', [clientId, builderId])
  const [rows] = await conn.execute<RowDataPacket[]>(
    'SELECT id FROM conversations WHERE client_id = ? AND builder_id = ?',
    [clientId, builderId],
  )
  return rows[0].id as number
}

/** The id of the conversation between two people, or null if they haven't talked yet. */
export async function conversationBetween(clientId: number, builderId: number): Promise<number | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT id FROM conversations WHERE client_id = ? AND builder_id = ?',
    [clientId, builderId],
  )
  return rows[0] ? (rows[0].id as number) : null
}

/**
 * Whether a builder may start a conversation with a client: only once they have quoted on one of
 * the client's jobs or have a project together, so builders can't message clients out of the blue.
 */
export async function builderKnowsClient(builderId: number, clientId: number): Promise<boolean> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT EXISTS (SELECT 1 FROM quotes q JOIN jobs j ON j.id = q.job_id WHERE q.builder_id = ? AND j.client_id = ?)
         OR EXISTS (SELECT 1 FROM projects p WHERE p.builder_id = ? AND p.client_id = ?) AS knows`,
    [builderId, clientId, builderId, clientId],
  )
  return Boolean(rows[0].knows)
}
