import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db.ts'
import { subscribe } from '../events.ts'
import { createBuilder, createClient, hire, newAgent, postJob, resetDb, sendQuote, signUp } from '../test/helpers.ts'
import type { Person } from '../test/helpers.ts'

beforeEach(resetDb)

async function talking(): Promise<{ ana: Person; bob: Person; id: number }> {
  const ana = await createClient({ name: 'Ana Lima' })
  const bob = await createBuilder({ businessName: 'Bob Builds' }, { name: 'Bob Stone' })
  const res = await ana.agent.post('/api/conversations').send({ userId: bob.user.id })
  return { ana, bob, id: res.body.conversation.id }
}

const send = (person: Person, id: number, text: string) =>
  person.agent.post(`/api/conversations/${id}/messages`).send({ text })

describe('POST /api/conversations', () => {
  it('lets a client message any builder with a profile, starting the conversation once', async () => {
    const ana = await createClient({ name: 'Ana Lima' })
    const bob = await createBuilder({ businessName: 'Bob Builds' }, { name: 'Bob Stone' })
    const res = await ana.agent.post('/api/conversations').send({ userId: bob.user.id })
    expect(res.status).toBe(200)
    expect(res.body.conversation).toEqual({
      id: expect.any(Number),
      other: { id: bob.user.id, name: 'Bob Stone', role: 'builder', businessName: 'Bob Builds' },
      lastMessage: null,
      unread: 0,
    })
    const again = await ana.agent.post('/api/conversations').send({ userId: bob.user.id })
    expect(again.body.conversation.id).toBe(res.body.conversation.id)
  })

  it("won't start a conversation with a builder who has no profile yet", async () => {
    const ana = await createClient()
    const newBuilder = await signUp({ role: 'builder' })
    const res = await ana.agent.post('/api/conversations').send({ userId: newBuilder.user.id })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("This builder doesn't have a profile yet.")
  })

  it('lets a builder message a client only once they have quoted for them or work together', async () => {
    const ana = await createClient({ name: 'Ana Lima' })
    const bob = await createBuilder()
    let res = await bob.agent.post('/api/conversations').send({ userId: ana.user.id })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('You can message a client once you have quoted for them or have a project together.')

    await sendQuote(bob, (await postJob(ana)).id)
    res = await bob.agent.post('/api/conversations').send({ userId: ana.user.id })
    expect(res.status).toBe(200)
    expect(res.body.conversation.other).toEqual({ id: ana.user.id, name: 'Ana Lima', role: 'client', businessName: null })

    const cat = await createBuilder()
    await hire(await createClient(), cat)
    expect((await cat.agent.post('/api/conversations').send({ userId: ana.user.id })).status).toBe(403)
  })

  it.each([
    ['someone who does not exist', 999_999, 404, "This person doesn't exist."],
    ['nobody', undefined, 404, "This person doesn't exist."],
  ])('refuses %s', async (_label, userId, status, error) => {
    const ana = await createClient()
    const res = await ana.agent.post('/api/conversations').send({ userId })
    expect(res.status).toBe(status)
    expect(res.body.error).toBe(error)
  })

  it('only connects clients with builders', async () => {
    const ana = await createClient()
    const eve = await createClient()
    let res = await ana.agent.post('/api/conversations').send({ userId: eve.user.id })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('You can message builders.')

    const bob = await createBuilder()
    const cat = await createBuilder()
    res = await bob.agent.post('/api/conversations').send({ userId: cat.user.id })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('You can message clients.')
  })
})

describe('messages', () => {
  it('sends a message and tells the other person straight away', async () => {
    const { ana, bob, id } = await talking()
    const heard = vi.fn()
    const stop = subscribe(bob.user.id, heard)
    const res = await send(ana, id, '  Could you come by Thursday?\r\nAny time works.  ')
    stop()
    expect(res.status).toBe(201)
    expect(res.body.message).toEqual({
      id: expect.any(Number),
      fromMe: true,
      text: 'Could you come by Thursday?\nAny time works.',
      sentAt: expect.any(Number),
    })
    expect(heard).toHaveBeenCalledWith({ type: 'message', conversationId: id })
  })

  it('lists conversations with the latest message and unread count, most recent first', async () => {
    const { ana, bob, id } = await talking()
    const cat = await createBuilder({ businessName: 'Cat Co' })
    const quiet = (await ana.agent.post('/api/conversations').send({ userId: cat.user.id })).body.conversation.id
    // Times are kept to the second, so make the quiet one clearly older.
    await db.execute('UPDATE conversations SET created_at = NOW() - INTERVAL 1 HOUR WHERE id = ?', [quiet])
    await send(ana, id, 'Hello')
    await send(bob, id, 'Hi Ana')
    await send(bob, id, 'Thursday works')

    const forAna = (await ana.agent.get('/api/conversations')).body.conversations
    expect(forAna.map((c: { id: number }) => c.id)).toEqual([id, quiet])
    expect(forAna[0]).toMatchObject({
      other: { name: 'Bob Stone', businessName: 'Bob Builds' },
      lastMessage: { text: 'Thursday works', fromMe: false, sentAt: expect.any(Number) },
      unread: 2,
    })
    const forBob = (await bob.agent.get('/api/conversations')).body.conversations
    expect(forBob).toHaveLength(1)
    // Bob hasn't opened the conversation, so Ana's message is still unread for him.
    expect(forBob[0]).toMatchObject({ other: { name: 'Ana Lima', role: 'client' }, lastMessage: { fromMe: true }, unread: 1 })
  })

  it('marks messages read when they are fetched, and tells the sender', async () => {
    const { ana, bob, id } = await talking()
    const mine = (await send(ana, id, 'Hello')).body.message
    let res = await ana.agent.get(`/api/conversations/${id}/messages`)
    expect(res.body.seenUpTo).toBeNull()

    const heard = vi.fn()
    const stop = subscribe(ana.user.id, heard)
    res = await bob.agent.get(`/api/conversations/${id}/messages`)
    stop()
    expect(res.status).toBe(200)
    expect(res.body.messages).toEqual([{ id: mine.id, fromMe: false, text: 'Hello', sentAt: expect.any(Number) }])
    expect(res.body.conversation.unread).toBe(0)
    expect(heard).toHaveBeenCalledWith({ type: 'read', conversationId: id })

    expect((await ana.agent.get(`/api/conversations/${id}/messages`)).body.seenUpTo).toBe(mine.id)
    expect((await bob.agent.get('/api/conversations')).body.conversations[0].unread).toBe(0)
  })

  it('returns only newer messages when asked', async () => {
    const { ana, bob, id } = await talking()
    const first = (await send(ana, id, 'One')).body.message
    await send(bob, id, 'Two')
    const res = await ana.agent.get(`/api/conversations/${id}/messages?after=${first.id}`)
    expect(res.body.messages.map((m: { text: string }) => m.text)).toEqual(['Two'])
  })

  it.each([
    ['', 'Write a message first.'],
    ['   ', 'Write a message first.'],
    ['x'.repeat(2001), 'Messages can be up to 2,000 characters.'],
  ])('refuses the message %j', async (text, error) => {
    const { ana, id } = await talking()
    const res = await send(ana, id, text)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it('keeps a conversation private to the two people in it', async () => {
    const { ana, id } = await talking()
    await send(ana, id, 'Private')
    for (const person of [await createClient(), await createBuilder()]) {
      let res = await person.agent.get(`/api/conversations/${id}/messages`)
      expect(res.status).toBe(404)
      expect(res.body.error).toBe("This conversation doesn't exist.")
      res = await send(person, id, 'Let me in')
      expect(res.status).toBe(404)
    }
    expect((await ana.agent.get('/api/conversations/nope/messages')).status).toBe(404)
    expect((await newAgent().get(`/api/conversations/${id}/messages`)).status).toBe(401)
  })
})
