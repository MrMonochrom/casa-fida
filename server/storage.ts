// Where uploaded files (today, the photos on project updates) are kept: in a bucket on an
// S3-compatible file storage service (Cloudflare R2, Backblaze B2, DigitalOcean Spaces, Amazon S3…)
// when S3_BUCKET is set, and otherwise in a folder on this computer. Only the server reads them:
// the bucket stays private, and the app gets each photo from the server, which checks who's asking.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { AwsClient } from 'aws4fetch'

export interface Storage {
  /** Where the files are, for messages: "bucket casa-fida at https://…" or "folder /data/files". */
  readonly description: string
  /** Files on this computer's own disk, which go if the computer does. */
  readonly onThisComputer: boolean
  put(key: string, data: Buffer, contentType: string): Promise<void>
  /** The file, or null if there isn't one with this key. */
  get(key: string): Promise<Buffer | null>
  /** Removes the file. Removing one that isn't there is fine. */
  delete(key: string): Promise<void>
}

/** Keys are made by the server (like photos/12/0b7c….jpg), never taken from a request. */
function checkKey(key: string) {
  if (!/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i.test(key) || key.includes('..')) {
    throw new Error(`Not a valid file key: ${key}`)
  }
}

/** A bucket on an S3-compatible service, reached at `endpoint`/`bucket`/`key` (path-style). */
export class BucketStorage implements Storage {
  readonly onThisComputer = false
  readonly description: string
  private readonly client: AwsClient
  private readonly base: string

  constructor(options: { endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string }) {
    this.base = `${options.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(options.bucket)}`
    this.description = `bucket ${options.bucket} at ${options.endpoint}`
    // A few quick retries when the service is briefly unavailable (5xx or 429) rather than its default 10.
    this.client = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      service: 's3',
      region: options.region,
      retries: 3,
    })
  }

  private async send(method: string, key: string, init: RequestInit = {}) {
    checkKey(key)
    const url = `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`
    return this.client.fetch(url, { ...init, method, signal: AbortSignal.timeout(30_000) })
  }

  private async failure(res: Response, what: string) {
    // S3 explains errors in a small XML document: <Code>NoSuchBucket</Code><Message>…</Message>.
    const body = await res.text().catch(() => '')
    const code = /<Code>([^<]*)<\/Code>/.exec(body)?.[1]
    const message = /<Message>([^<]*)<\/Message>/.exec(body)?.[1]
    return new Error(`File storage: ${what} failed with ${res.status}${code ? ` ${code}` : ''}${message ? `: ${message}` : ''}`)
  }

  async put(key: string, data: Buffer, contentType: string) {
    const res = await this.send('PUT', key, { body: new Uint8Array(data), headers: { 'Content-Type': contentType } })
    if (!res.ok) throw await this.failure(res, `saving ${key}`)
    await res.body?.cancel()
  }

  async get(key: string) {
    const res = await this.send('GET', key)
    if (res.status === 404) {
      await res.body?.cancel()
      return null
    }
    if (!res.ok) throw await this.failure(res, `reading ${key}`)
    return Buffer.from(await res.arrayBuffer())
  }

  async delete(key: string) {
    const res = await this.send('DELETE', key)
    if (!res.ok && res.status !== 404) throw await this.failure(res, `removing ${key}`)
    await res.body?.cancel()
  }
}

/** A folder on this computer, with each key as a path inside it. */
export class FolderStorage implements Storage {
  readonly onThisComputer = true
  readonly description: string
  private readonly dir: string

  constructor(dir: string) {
    this.dir = dir
    this.description = `folder ${dir}`
  }

  private path(key: string) {
    checkKey(key)
    return join(this.dir, ...key.split('/'))
  }

  async put(key: string, data: Buffer, _contentType?: string) {
    const path = this.path(key)
    await mkdir(dirname(path), { recursive: true })
    // Written next to its place and renamed in, so no one ever reads half a file.
    await writeFile(`${path}.tmp`, data)
    await rename(`${path}.tmp`, path)
  }

  async get(key: string) {
    try {
      return await readFile(this.path(key))
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') return null
      throw err
    }
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true })
  }
}

/**
 * The storage these settings describe: the bucket S3_BUCKET at S3_ENDPOINT, or else the folder
 * STORAGE_DIR (by default ~/.casa-fida/files, next to the database `npm run db:start` runs).
 */
export function storageFrom(env: NodeJS.ProcessEnv): Storage {
  // || rather than ??: an empty setting (as Docker Compose passes for unset ones) counts as unset.
  if (env.S3_BUCKET) {
    const missing = ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter((name) => !env[name])
    if (missing.length > 0) throw new Error(`S3_BUCKET is set, but ${missing.join(', ')} isn't. See .env.example.`)
    return new BucketStorage({
      endpoint: env.S3_ENDPOINT!,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION || 'auto',
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    })
  }
  return new FolderStorage(env.STORAGE_DIR || join(homedir(), '.casa-fida', 'files'))
}

export const storage = storageFrom(process.env)

/** Where a photo on a project update is kept: photos/<update id>/<random id>.jpg */
export const photoKey = (updateId: number, id: string) => `photos/${updateId}/${id}.jpg`
