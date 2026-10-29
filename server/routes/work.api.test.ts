import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RowDataPacket } from 'mysql2/promise'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STAGES_MAX } from '../../shared/rules.ts'
import { db } from '../db.ts'
import { subscribe } from '../events.ts'
import { storage } from '../storage.ts'
import {
  FAKE_JPEG,
  activeProject,
  createBuilder,
  createClient,
  hire,
  newAgent,
  propose,
  resetDb,
} from '../test/helpers.ts'
import type { Person } from '../test/helpers.ts'
import { TEST_FILES } from '../test/testDb.ts'

beforeEach(resetDb)

/** A builder and a client with an active project. */
async function working(): Promise<{ bob: Person; ana: Person; id: number }> {
  const bob = await createBuilder()
  const ana = await createClient()
  const id = await activeProject(bob, ana)
  return { bob, ana, id }
}

async function addStages(builder: Person, projectId: number, ...names: string[]) {
  let project
  for (const name of names) project = (await builder.agent.post(`/api/projects/${projectId}/stages`).send({ name })).body.project
  return project.stages as { id: number; name: string; status: string }[]
}

describe('stages', () => {
  it('adds stages at the end, and tells the client', async () => {
    const { bob, ana, id } = await working()
    const heard = vi.fn()
    const stop = subscribe(ana.user.id, heard)
    const res = await bob.agent.post(`/api/projects/${id}/stages`).send({ name: '  Framing  ' })
    expect(res.status).toBe(201)
    await bob.agent.post(`/api/projects/${id}/stages`).send({ name: 'Roofing' })
    stop()
    const project = (await ana.agent.get(`/api/projects/${id}`)).body.project
    expect(project.stages).toEqual([
      { id: expect.any(Number), name: 'Framing', status: 'todo' },
      { id: expect.any(Number), name: 'Roofing', status: 'todo' },
    ])
    expect(heard).toHaveBeenCalledWith({ type: 'project', projectId: id })
  })

  it('can also set them up on a proposal', async () => {
    const bob = await createBuilder()
    const proposal = await propose(bob, 'ana@example.com')
    expect((await bob.agent.post(`/api/projects/${proposal.id}/stages`).send({ name: 'Design' })).status).toBe(201)
  })

  it.each([
    [{}, 'Give the stage a name.'],
    [{ name: '   ' }, 'Give the stage a name.'],
    [{ name: 'x'.repeat(81) }, 'Keep stage names under 80 characters.'],
  ])('refuses the stage %j', async (body, error) => {
    const { bob, id } = await working()
    const res = await bob.agent.post(`/api/projects/${id}/stages`).send(body)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it(`stops at ${STAGES_MAX} stages`, async () => {
    const { bob, id } = await working()
    await addStages(bob, id, ...Array.from({ length: STAGES_MAX }, (_, i) => `Stage ${i + 1}`))
    const res = await bob.agent.post(`/api/projects/${id}/stages`).send({ name: 'One too many' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe(`A project can have up to ${STAGES_MAX} stages.`)
  })

  it('renames a stage and moves it along', async () => {
    const { bob, ana, id } = await working()
    const [stage] = await addStages(bob, id, 'Framing')
    let res = await bob.agent.put(`/api/stages/${stage.id}`).send({ name: 'Wall framing', status: 'in_progress' })
    expect(res.status).toBe(200)
    expect(res.body.project.stages[0]).toEqual({ id: stage.id, name: 'Wall framing', status: 'in_progress' })

    res = await bob.agent.put(`/api/stages/${stage.id}`).send({ status: 'done' })
    expect(res.body.project.stages[0].status).toBe('done')
    expect((await ana.agent.get(`/api/projects/${id}`)).body.project.stages[0].status).toBe('done')
  })

  it.each([
    [{}, 'Nothing to change.'],
    [{ status: 'finished' }, 'A stage is to do, in progress or done.'],
    [{ name: '' }, 'Give the stage a name.'],
  ])('refuses the change %j', async (body, error) => {
    const { bob, id } = await working()
    const [stage] = await addStages(bob, id, 'Framing')
    const res = await bob.agent.put(`/api/stages/${stage.id}`).send(body)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it('removes a stage', async () => {
    const { bob, id } = await working()
    const [first] = await addStages(bob, id, 'Framing', 'Roofing')
    const res = await bob.agent.delete(`/api/stages/${first.id}`)
    expect(res.status).toBe(200)
    expect(res.body.project.stages.map((s: { name: string }) => s.name)).toEqual(['Roofing'])
  })

  it('puts stages in a new order, which must list each one once', async () => {
    const { bob, id } = await working()
    const [a, b, c] = await addStages(bob, id, 'A', 'B', 'C')
    const res = await bob.agent.put(`/api/projects/${id}/stages/order`).send({ ids: [c.id, a.id, b.id] })
    expect(res.status).toBe(200)
    expect(res.body.project.stages.map((s: { name: string }) => s.name)).toEqual(['C', 'A', 'B'])

    for (const ids of [[a.id, b.id], [a.id, a.id, b.id], [a.id, b.id, 999_999], 'nope']) {
      const bad = await bob.agent.put(`/api/projects/${id}/stages/order`).send({ ids })
      expect(bad.status).toBe(400)
      expect(bad.body.error).toBe('The new order must list each stage once.')
    }
  })

  it("is only for the project's builder, while the project is open", async () => {
    const { bob, ana, id } = await working()
    const [stage] = await addStages(bob, id, 'Framing')

    let res = await ana.agent.put(`/api/stages/${stage.id}`).send({ status: 'done' })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Only builders can do that.')
    const cat = await createBuilder()
    expect((await cat.agent.put(`/api/stages/${stage.id}`).send({ status: 'done' })).status).toBe(404)
    expect((await cat.agent.post(`/api/projects/${id}/stages`).send({ name: 'Mine' })).status).toBe(404)

    res = await bob.agent.put('/api/stages/999999').send({ status: 'done' })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("This stage doesn't exist.")

    await bob.agent.post(`/api/projects/${id}/complete`)
    res = await bob.agent.post(`/api/projects/${id}/stages`).send({ name: 'Late' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("You can't do that while the project is completed.")
    expect((await bob.agent.delete(`/api/stages/${stage.id}`)).status).toBe(409)
  })
})

describe('updates', () => {
  it('posts an update about a stage, which both sides see, newest first', async () => {
    const { bob, ana, id } = await working()
    const [stage] = await addStages(bob, id, 'Framing')
    const heard = vi.fn()
    const stop = subscribe(ana.user.id, heard)

    const first = await bob.agent.post(`/api/projects/${id}/updates`).send({ body: 'Walls are up.\r\nRoof next.', stageId: stage.id })
    expect(first.status).toBe(201)
    expect(first.body.update).toEqual({
      id: expect.any(Number),
      author: { id: bob.user.id, name: bob.name },
      stage: { id: stage.id, name: 'Framing' },
      body: 'Walls are up.\nRoof next.',
      photos: [],
      createdAt: expect.any(Number),
    })
    await bob.agent.post(`/api/projects/${id}/updates`).send({ body: 'Trusses delivered.' })
    stop()
    expect(heard).toHaveBeenCalledWith({ type: 'project', projectId: id })

    for (const person of [ana, bob]) {
      const res = await person.agent.get(`/api/projects/${id}/updates`)
      expect(res.status).toBe(200)
      expect(res.body.updates.map((u: { body: string }) => u.body)).toEqual(['Trusses delivered.', 'Walls are up.\nRoof next.'])
    }
    expect((await (await createClient()).agent.get(`/api/projects/${id}/updates`)).status).toBe(404)
  })

  it.each([
    [{}, 'Write a few words about the progress.'],
    [{ body: 'x'.repeat(4001) }, 'Keep updates under 4,000 characters.'],
    [{ body: 'Hi', stageId: 999_999 }, "That stage isn't part of this project."],
    [{ body: 'Hi', stageId: 'abc' }, "That stage isn't part of this project."],
  ])('refuses the update %j', async (body, error) => {
    const { bob, id } = await working()
    const res = await bob.agent.post(`/api/projects/${id}/updates`).send(body)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it("won't use another project's stage", async () => {
    const { bob, id } = await working()
    const other = await activeProject(bob, await createClient())
    const [stage] = await addStages(bob, other, 'Elsewhere')
    const res = await bob.agent.post(`/api/projects/${id}/updates`).send({ body: 'Hi', stageId: stage.id })
    expect(res.status).toBe(400)
  })

  it('needs an active project, and only its builder posts', async () => {
    const bob = await createBuilder()
    const ana = await createClient()
    const proposal = await propose(bob, ana.email)
    let res = await bob.agent.post(`/api/projects/${proposal.id}/updates`).send({ body: 'Too early' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("You can't do that while the project is still a proposal.")

    const id = await hire(ana, bob)
    res = await ana.agent.post(`/api/projects/${id}/updates`).send({ body: 'From the client' })
    expect(res.status).toBe(403)
  })

  it('lets only the author delete an update', async () => {
    const { bob, ana, id } = await working()
    const update = (await bob.agent.post(`/api/projects/${id}/updates`).send({ body: 'Oops' })).body.update
    let res = await ana.agent.delete(`/api/updates/${update.id}`)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Only the person who posted an update can change it.')
    expect((await (await createBuilder()).agent.delete(`/api/updates/${update.id}`)).status).toBe(404)

    expect((await bob.agent.delete(`/api/updates/${update.id}`)).status).toBe(204)
    expect((await ana.agent.get(`/api/projects/${id}/updates`)).body.updates).toEqual([])
    res = await bob.agent.delete(`/api/updates/${update.id}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("This update doesn't exist.")
  })
})

describe('photos', () => {
  async function postedUpdate() {
    const { bob, ana, id } = await working()
    const update = (await bob.agent.post(`/api/projects/${id}/updates`).send({ body: 'Look' })).body.update
    return { bob, ana, id, updateId: update.id as number }
  }

  const upload = (person: Person, updateId: number, data: Buffer = FAKE_JPEG, type = 'image/jpeg') =>
    person.agent.post(`/api/updates/${updateId}/photos`).set('Content-Type', type).send(data)

  it('adds JPEG photos to an update, which the two people on the project can see', async () => {
    const { bob, ana, id, updateId } = await postedUpdate()
    const res = await upload(bob, updateId)
    expect(res.status).toBe(201)
    expect(res.body.photo).toEqual({ id: expect.any(Number), url: `/api/photos/${res.body.photo.id}` })

    const updates = (await ana.agent.get(`/api/projects/${id}/updates`)).body.updates
    expect(updates[0].photos).toEqual([res.body.photo])

    for (const person of [ana, bob]) {
      const photo = await person.agent.get(res.body.photo.url).buffer(true).parse((r, done) => {
        const chunks: Buffer[] = []
        r.on('data', (c: Buffer) => chunks.push(c))
        r.on('end', () => done(null, Buffer.concat(chunks)))
      })
      expect(photo.status).toBe(200)
      expect(photo.headers['content-type']).toBe('image/jpeg')
      expect(photo.headers['cache-control']).toBe('private, max-age=31536000, immutable')
      expect(Buffer.compare(photo.body, FAKE_JPEG)).toBe(0)
    }
  })

  it("keeps photos from people who aren't on the project", async () => {
    const { bob, updateId } = await postedUpdate()
    const photo = (await upload(bob, updateId)).body.photo
    for (const person of [await createClient(), await createBuilder()]) {
      expect((await person.agent.get(photo.url)).status).toBe(404)
    }
    expect((await newAgent().get(photo.url)).status).toBe(401)
  })

  it('only takes JPEGs', async () => {
    const { bob, updateId } = await postedUpdate()
    for (const [data, type] of [
      [Buffer.from('not an image'), 'image/jpeg'],
      [Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png'],
    ] as const) {
      const res = await upload(bob, updateId, data, type)
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Please upload a JPEG image.')
    }
  })

  it('refuses photos that are too big', async () => {
    const { bob, updateId } = await postedUpdate()
    const big = Buffer.concat([FAKE_JPEG, Buffer.alloc(3 * 1024 * 1024)])
    const res = await upload(bob, updateId, big)
    expect(res.status).toBe(413)
    expect(res.body.error).toBe('That file is too big.')
  })

  it('takes up to 6 per update', async () => {
    const { bob, updateId } = await postedUpdate()
    for (let i = 0; i < 6; i++) expect((await upload(bob, updateId)).status).toBe(201)
    const res = await upload(bob, updateId)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('An update can have up to 6 photos.')
  })

  /** Where each of the update's photos is kept in file storage (a folder, in these tests). */
  async function filesOf(updateId: number) {
    const [rows] = await db.execute<RowDataPacket[]>('SELECT storage_key FROM update_photos WHERE update_id = ?', [updateId])
    return rows.map((r) => join(TEST_FILES, r.storage_key as string))
  }

  it('keeps each photo in file storage, not in MySQL', async () => {
    const { bob, updateId } = await postedUpdate()
    await upload(bob, updateId)
    const [file] = await filesOf(updateId)
    expect(file).toMatch(new RegExp(`photos/${updateId}/[0-9a-f-]{36}\\.jpg$`))
    expect(readFileSync(file)).toEqual(FAKE_JPEG)
  })

  it('removes the photo files when the update is deleted', async () => {
    const { bob, updateId } = await postedUpdate()
    await upload(bob, updateId)
    await upload(bob, updateId)
    const files = await filesOf(updateId)
    expect(files.every((file) => existsSync(file))).toBe(true)
    expect((await bob.agent.delete(`/api/updates/${updateId}`)).status).toBe(204)
    expect(files.some((file) => existsSync(file))).toBe(false)
  })

  it('still deletes the update if removing a file fails, and reports it', async () => {
    const { bob, id, updateId } = await postedUpdate()
    await upload(bob, updateId)
    vi.spyOn(storage, 'delete').mockRejectedValue(new Error('storage down'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await bob.agent.delete(`/api/updates/${updateId}`)).status).toBe(204)
    expect((await bob.agent.get(`/api/projects/${id}/updates`)).body.updates).toEqual([])
    expect(errors).toHaveBeenCalledWith(expect.stringMatching(/^Removing photos\/.* from file storage failed:$/), expect.any(Error))
    vi.restoreAllMocks()
  })

  it("adds nothing if file storage can't take the photo", async () => {
    const { bob, updateId } = await postedUpdate()
    vi.spyOn(storage, 'put').mockRejectedValue(new Error('storage down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await upload(bob, updateId)
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Something went wrong on our side. Please try again.')
    expect(await filesOf(updateId)).toEqual([])
    vi.restoreAllMocks()
  })

  it("doesn't leave a file behind when the photo can't be added after all", async () => {
    const { bob, updateId } = await postedUpdate()
    // Another photo arrives between the check and the insert, making a seventh.
    for (let i = 0; i < 5; i++) await upload(bob, updateId)
    const put = storage.put.bind(storage)
    vi.spyOn(storage, 'put').mockImplementationOnce(async (key, data, type) => {
      await put(key, data, type)
      await db.execute(
        "INSERT INTO update_photos (update_id, position, mime_type, storage_key) VALUES (?, 99, 'image/jpeg', 'photos/elsewhere.jpg')",
        [updateId],
      )
    })
    const remove = vi.spyOn(storage, 'delete')
    const res = await upload(bob, updateId)
    expect(res.status).toBe(409)
    expect(remove).toHaveBeenCalledOnce()
    expect(existsSync(join(TEST_FILES, remove.mock.calls[0][0]))).toBe(false)
    vi.restoreAllMocks()
  })

  it('answers 404 for a photo whose file is missing, and reports it', async () => {
    const { bob, updateId } = await postedUpdate()
    const photo = (await upload(bob, updateId)).body.photo
    const [file] = await filesOf(updateId)
    await storage.delete(file.slice(TEST_FILES.length + 1))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await bob.agent.get(photo.url)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('No photo.')
    expect(errors).toHaveBeenCalledWith('Photo missing from file storage:', expect.any(Error))
    vi.restoreAllMocks()
  })

  it("only lets the update's author add photos, while the project is in progress", async () => {
    const { bob, ana, id, updateId } = await postedUpdate()
    expect((await (await createBuilder()).agent.post(`/api/updates/${updateId}/photos`).set('Content-Type', 'image/jpeg').send(FAKE_JPEG)).status).toBe(404)
    expect((await ana.agent.post(`/api/updates/${updateId}/photos`).set('Content-Type', 'image/jpeg').send(FAKE_JPEG)).status).toBe(403)

    await bob.agent.post(`/api/projects/${id}/complete`)
    const res = await upload(bob, updateId)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Photos can only be added while the project is in progress.')
  })
})
