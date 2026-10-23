import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { PHOTOS_PER_UPDATE, UPDATE_MAX } from '../../../shared/rules'
import { api } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Dialog } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { Avatar, Empty, FormError, Loading } from '../../components/ui'
import { ago, dateText } from '../../format'
import { resizeImage } from '../../resizeImage'
import { useSession } from '../../session'
import type { Project, ProjectUpdate } from '../../types'

interface Props {
  project: Project
  updates: ProjectUpdate[] | undefined
  error: string | null
  onReload: () => void
}

/** Progress posts from the builder, with photos, newest first. */
export function Updates({ project, updates, error, onReload }: Props) {
  const { user } = useSession()
  const [deleting, setDeleting] = useState<ProjectUpdate | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const canPost = project.myRole === 'builder' && project.status === 'active'

  return (
    <section className="section">
      {canPost && <UpdateComposer project={project} onPosted={onReload} />}
      {!updates ? (
        <Loading error={error} onRetry={onReload} />
      ) : updates.length === 0 ? (
        <Empty title="No updates yet.">
          <p className="muted">
            {canPost
              ? 'Post progress and photos here. Your client sees them straight away.'
              : 'Your builder posts progress and photos here as the work goes on.'}
          </p>
        </Empty>
      ) : (
        <ol className="updates">
          {updates.map((update) => (
            <li key={update.id} className="card update">
              <div className="update__top">
                <Avatar name={update.author.name} size="small" />
                <div className="update__who">
                  <strong>{update.author.name}</strong>
                  <span className="muted small" title={dateText(update.createdAt)}>
                    {ago(update.createdAt)}
                  </span>
                </div>
                {update.stage && <span className="tag">{update.stage.name}</span>}
                {update.author.id === user.id && (
                  <button
                    type="button"
                    className="icon-button update__delete"
                    aria-label="Delete this update"
                    onClick={() => setDeleting(update)}
                  >
                    ×
                  </button>
                )}
              </div>
              <p className="prewrap">{update.body}</p>
              {update.photos.length > 0 && (
                <div className="photos">
                  {update.photos.map((p, i) => (
                    <button key={p.id} type="button" className="photo" onClick={() => setPhoto(p.url)}>
                      <img src={p.url} alt={`Photo ${i + 1} of ${update.photos.length}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this update?"
          message="It's removed for your client too, with its photos."
          confirmLabel="Delete update"
          danger
          onConfirm={async () => {
            await api.deleteUpdate(deleting.id)
            setDeleting(null)
            onReload()
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
      {photo && (
        <Dialog title="Photo" onClose={() => setPhoto(null)} wide>
          <img className="photo-full" src={photo} alt="" />
        </Dialog>
      )}
    </section>
  )
}

interface Picked {
  file: File
  preview: string
}

function UpdateComposer({ project, onPosted }: { project: Project; onPosted: () => void }) {
  const [body, setBody] = useState('')
  const inProgress = project.stages.find((s) => s.status === 'in_progress')
  const [stageId, setStageId] = useState<string>(inProgress ? String(inProgress.id) : '')
  const [photos, setPhotos] = useState<Picked[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The previews take memory until they're let go: when removed, posted, or the composer goes away.
  const shown = useRef<Picked[]>([])
  useEffect(() => {
    shown.current = photos
  }, [photos])
  useEffect(() => () => shown.current.forEach((p) => URL.revokeObjectURL(p.preview)), [])

  function remove(picked: Picked) {
    URL.revokeObjectURL(picked.preview)
    setPhotos((current) => current.filter((p) => p !== picked))
  }

  function pick(files: FileList | null) {
    if (!files) return
    const room = PHOTOS_PER_UPDATE - photos.length
    const chosen = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room)
    if (files.length > room) setError(`An update can have up to ${PHOTOS_PER_UPDATE} photos.`)
    setPhotos([...photos, ...chosen.map((file) => ({ file, preview: URL.createObjectURL(file) }))])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) {
      setError('Write a few words about the progress.')
      return
    }
    setError(null)
    setStatus('Posting…')
    let update: ProjectUpdate
    try {
      update = await api.postUpdate(project.id, body, stageId ? Number(stageId) : null)
    } catch (err) {
      setError((err as Error).message)
      setStatus(null)
      return
    }
    // The update is posted; now its photos, one at a time.
    let photoError: string | null = null
    for (const [i, picked] of photos.entries()) {
      setStatus(`Uploading photo ${i + 1} of ${photos.length}…`)
      try {
        await api.addPhoto(update.id, await resizeImage(picked.file))
      } catch (err) {
        photoError = `Your update is posted, but a photo didn't upload: ${(err as Error).message}`
      }
    }
    for (const picked of photos) URL.revokeObjectURL(picked.preview)
    setStatus(null)
    setBody('')
    setPhotos([])
    setError(photoError)
    onPosted()
  }

  const busy = status !== null

  return (
    <form className="card form composer" onSubmit={handleSubmit}>
      <label className="field__label" htmlFor="update-body">
        Post an update
      </label>
      <textarea
        id="update-body"
        className="input textarea"
        rows={3}
        maxLength={UPDATE_MAX}
        placeholder="What got done, what's next, anything your client should know."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {photos.length > 0 && (
        <div className="photos photos--small">
          {photos.map((p, i) => (
            <div key={p.preview} className="photo">
              <img src={p.preview} alt={`New photo ${i + 1}`} />
              <button
                type="button"
                className="photo__remove"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => remove(p)}
                disabled={busy}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="composer__bar">
        <label className={`button button--ghost ${photos.length >= PHOTOS_PER_UPDATE || busy ? 'button--disabled' : ''}`}>
          <Icon name="camera" size={18} /> Add photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="visually-hidden"
            disabled={photos.length >= PHOTOS_PER_UPDATE || busy}
            onChange={(e) => {
              pick(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
        {project.stages.length > 0 && (
          <select
            className="input select select--small"
            aria-label="Stage this update is about"
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
          >
            <option value="">No particular stage</option>
            {project.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="button button--primary composer__post" disabled={busy}>
          {status ?? 'Post update'}
        </button>
      </div>
      <FormError error={error} />
    </form>
  )
}
