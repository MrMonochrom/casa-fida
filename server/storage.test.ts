import { createServer } from 'node:http'
import type { IncomingMessage, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BucketStorage, FolderStorage, photoKey, storageFrom } from './storage.ts'

const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

describe('a folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casa-fida-storage-'))
  const storage = new FolderStorage(dir)
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps files under their keys, and gives them back', async () => {
    await storage.put('photos/1/a.jpg', photo, 'image/jpeg')
    expect(await storage.get('photos/1/a.jpg')).toEqual(photo)
    expect(readdirSync(join(dir, 'photos', '1'))).toEqual(['a.jpg'])
  })

  it('has nothing for a key it was never given, and removing that is fine', async () => {
    expect(await storage.get('photos/1/missing.jpg')).toBeNull()
    await expect(storage.delete('photos/1/missing.jpg')).resolves.toBeUndefined()
  })

  it('removes files', async () => {
    await storage.put('photos/2/b.jpg', photo, 'image/jpeg')
    await storage.delete('photos/2/b.jpg')
    expect(await storage.get('photos/2/b.jpg')).toBeNull()
  })

  it("refuses keys that would reach outside it", async () => {
    for (const key of ['../escape.jpg', 'photos/../../escape.jpg', '/etc/passwd', 'photos//a.jpg', '']) {
      await expect(storage.put(key, photo, 'image/jpeg')).rejects.toThrow('Not a valid file key')
    }
  })
})

interface Received {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: Buffer
}

/** Just enough of S3 to see what the bucket storage sends: objects in a Map, and every request kept. */
function fakeS3() {
  const objects = new Map<string, Buffer>()
  const received: Received[] = []
  let failNext: { status: number; code: string; message: string } | null = null
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks)
    received.push({ method: req.method!, url: req.url!, headers: req.headers, body })
    if (failNext) {
      const { status, code, message } = failNext
      failNext = null
      res.writeHead(status, { 'Content-Type': 'application/xml' })
      res.end(`<?xml version="1.0"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`)
      return
    }
    const path = decodeURIComponent(req.url!)
    if (req.method === 'PUT') {
      objects.set(path, body)
      res.writeHead(200).end()
    } else if (req.method === 'GET') {
      const object = objects.get(path)
      if (object) res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(object)
      else res.writeHead(404, { 'Content-Type': 'application/xml' }).end('<Error><Code>NoSuchKey</Code></Error>')
    } else if (req.method === 'DELETE') {
      objects.delete(path)
      res.writeHead(204).end()
    } else {
      res.writeHead(405).end()
    }
  })
  return {
    server,
    objects,
    received,
    fail(status: number, code: string, message: string) {
      failNext = { status, code, message }
    },
  }
}

describe('a bucket', () => {
  const s3 = fakeS3()
  let server: Server
  let storage: BucketStorage

  beforeAll(async () => {
    server = s3.server
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const { port } = server.address() as AddressInfo
    storage = new BucketStorage({
      endpoint: `http://127.0.0.1:${port}/`,
      bucket: 'casa-fida',
      region: 'auto',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    })
  })
  afterEach(() => {
    s3.received.length = 0
  })
  afterAll(() => new Promise((done) => server.close(done)))

  it('saves a file at bucket/key, signed with the access key', async () => {
    await storage.put('photos/7/a.jpg', photo, 'image/jpeg')
    const [put] = s3.received
    expect(put.method).toBe('PUT')
    expect(put.url).toBe('/casa-fida/photos/7/a.jpg')
    expect(put.headers['content-type']).toBe('image/jpeg')
    expect(put.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=test-key\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[^,]+, Signature=[0-9a-f]{64}$/,
    )
    expect(put.headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/)
    expect(put.body).toEqual(photo)
  })

  it('gives files back, and nothing for a key it was never given', async () => {
    await storage.put('photos/7/b.jpg', photo, 'image/jpeg')
    expect(await storage.get('photos/7/b.jpg')).toEqual(photo)
    expect(await storage.get('photos/7/missing.jpg')).toBeNull()
  })

  it('removes files, and removing one that is gone is fine', async () => {
    await storage.put('photos/7/c.jpg', photo, 'image/jpeg')
    await storage.delete('photos/7/c.jpg')
    expect(s3.objects.has('/casa-fida/photos/7/c.jpg')).toBe(false)
    await expect(storage.delete('photos/7/c.jpg')).resolves.toBeUndefined()
  })

  it("says what the service answered when it refuses", async () => {
    s3.fail(403, 'AccessDenied', 'Access Denied')
    await expect(storage.put('photos/7/d.jpg', photo, 'image/jpeg')).rejects.toThrow(
      'File storage: saving photos/7/d.jpg failed with 403 AccessDenied: Access Denied',
    )
  })

  it('tries again when the service is briefly unavailable', async () => {
    s3.fail(503, 'SlowDown', 'Please reduce your request rate.')
    await storage.put('photos/7/e.jpg', photo, 'image/jpeg')
    expect(s3.received.map((r) => r.method)).toEqual(['PUT', 'PUT'])
    expect(s3.objects.get('/casa-fida/photos/7/e.jpg')).toEqual(photo)
  })
})

describe('the settings', () => {
  it('use the bucket when S3_BUCKET is set, and say which settings are missing', () => {
    const bucket = storageFrom({
      S3_BUCKET: 'casa-fida',
      S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
    })
    expect(bucket.onThisComputer).toBe(false)
    expect(bucket.description).toBe('bucket casa-fida at https://example.r2.cloudflarestorage.com')
    expect(() => storageFrom({ S3_BUCKET: 'casa-fida', S3_ENDPOINT: 'https://example.com' })).toThrow(
      "S3_BUCKET is set, but S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY isn't.",
    )
  })

  it('use a folder otherwise: STORAGE_DIR, or ~/.casa-fida/files', () => {
    expect(storageFrom({ STORAGE_DIR: '/data/files', S3_BUCKET: '' }).description).toBe('folder /data/files')
    const local = storageFrom({})
    expect(local.onThisComputer).toBe(true)
    expect(local.description).toMatch(/\.casa-fida[/\\]files$/)
  })

  it('give each photo a key under its update', () => {
    expect(photoKey(12, 'abc')).toBe('photos/12/abc.jpg')
  })
})
