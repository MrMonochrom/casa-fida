// Moves the photos kept in MySQL into file storage: the bucket in S3_BUCKET, or the folder in
// STORAGE_DIR (see server/storage.ts). Each one is read back from there before MySQL lets go of it.
// It can stop and start again: photos already moved are skipped. 010 then removes the column.
import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2/promise'
import type { Migration } from '../../server/migrate.ts'
import { photoKey, storage } from '../../server/storage.ts'

const moveExistingPhotos: Migration = async ({ db, log }) => {
  const [[{ total }]] = await db.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM update_photos WHERE storage_key IS NULL')
  if (total === 0) return
  log(`Moving ${total} photos to the ${storage.description}...`)

  let moved = 0
  let lastId = 0
  for (;;) {
    // One at a time: each can be a few megabytes.
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT id, update_id, mime_type, data FROM update_photos WHERE storage_key IS NULL AND id > ? ORDER BY id LIMIT 1',
      [lastId],
    )
    const photo = rows[0]
    if (!photo) break
    lastId = photo.id
    const key = photoKey(photo.update_id, randomUUID())
    await storage.put(key, photo.data, photo.mime_type)
    const copy = await storage.get(key)
    if (!copy || !copy.equals(photo.data)) throw new Error(`Photo ${photo.id} didn't read back the same from the ${storage.description}.`)
    await db.query('UPDATE update_photos SET storage_key = ?, data = NULL WHERE id = ?', [key, photo.id])
    moved++
    if (moved % 100 === 0) log(`${moved} of ${total} moved.`)
  }
  log(`Moved ${moved} photos.`)
}

export default moveExistingPhotos
