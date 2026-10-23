import { useState } from 'react'
import type { FormEvent } from 'react'
import { STAGES_MAX, STAGE_NAME_MAX, STAGE_SUGGESTIONS } from '../../../shared/rules'
import { api } from '../../api'
import { FormError, Progress } from '../../components/ui'
import { STAGE_STATUS } from '../../format'
import type { Project, Stage, StageStatus } from '../../types'

interface Props {
  project: Project
  onChange: (project: Project) => void
}

const MARKS: Record<StageStatus, string> = { todo: '○', in_progress: '◐', done: '✓' }

/** The project's stages and progress. The builder can add, rename, move and tick them off. */
export function Stages({ project, onChange }: Props) {
  const editable = project.myRole === 'builder' && (project.status === 'proposed' || project.status === 'active')
  const done = project.stages.filter((s) => s.status === 'done').length

  return (
    <section className="section">
      <h2 className="section__title">Stages</h2>
      <div className="card">
        <Progress done={done} total={project.stages.length} />
        {editable ? (
          <StageEditor project={project} onChange={onChange} />
        ) : project.stages.length === 0 ? (
          <p className="muted">The builder hasn't added any stages yet.</p>
        ) : (
          <ol className="stages">
            {project.stages.map((stage) => (
              <li key={stage.id} className={`stage stage--${stage.status}`}>
                <span className="stage__mark" aria-hidden="true">
                  {MARKS[stage.status]}
                </span>
                <span className="stage__name">{stage.name}</span>
                <span className="stage__status">{STAGE_STATUS[stage.status].label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function StageEditor({ project, onChange }: Props) {
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { stages } = project
  const full = stages.length >= STAGES_MAX
  const names = new Set(stages.map((s) => s.name))
  const suggestions = STAGE_SUGGESTIONS.filter((s) => !names.has(s))

  /** Runs a change on the server and shows the project it sends back. */
  async function run(change: () => Promise<Project>) {
    setBusy(true)
    setError(null)
    try {
      onChange(await change())
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add(e?: FormEvent, name = newName) {
    e?.preventDefault()
    if (!name.trim()) return
    if (await run(() => api.addStage(project.id, name))) setNewName('')
  }

  function move(index: number, by: -1 | 1) {
    const ids = stages.map((s) => s.id)
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    run(() => api.orderStages(project.id, ids))
  }

  async function saveName(e: FormEvent) {
    e.preventDefault()
    if (!renaming) return
    if (await run(() => api.saveStage(renaming.id, { name: renaming.name }))) setRenaming(null)
  }

  function row(stage: Stage, i: number) {
    if (renaming?.id === stage.id) {
      return (
        <li key={stage.id} className="stage stage--editing">
          <form className="inline-form" onSubmit={saveName}>
            <input
              className="input"
              aria-label="Stage name"
              value={renaming.name}
              maxLength={STAGE_NAME_MAX}
              autoFocus
              onChange={(e) => setRenaming({ id: stage.id, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
            />
            <button type="submit" className="button button--primary button--small" disabled={busy}>
              Save
            </button>
            <button type="button" className="button button--ghost button--small" onClick={() => setRenaming(null)}>
              Cancel
            </button>
          </form>
        </li>
      )
    }
    return (
      <li key={stage.id} className={`stage stage--${stage.status}`}>
        <span className="stage__mark" aria-hidden="true">
          {MARKS[stage.status]}
        </span>
        <span className="stage__name">{stage.name}</span>
        <select
          className="input select select--small"
          aria-label={`Status of ${stage.name}`}
          value={stage.status}
          disabled={busy}
          onChange={(e) => run(() => api.saveStage(stage.id, { status: e.target.value as StageStatus }))}
        >
          {(Object.keys(STAGE_STATUS) as StageStatus[]).map((status) => (
            <option key={status} value={status}>
              {STAGE_STATUS[status].label}
            </option>
          ))}
        </select>
        <span className="stage__tools">
          <button
            type="button"
            className="icon-button"
            aria-label={`Move ${stage.name} up`}
            disabled={busy || i === 0}
            onClick={() => move(i, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Move ${stage.name} down`}
            disabled={busy || i === stages.length - 1}
            onClick={() => move(i, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Rename ${stage.name}`}
            disabled={busy}
            onClick={() => setRenaming({ id: stage.id, name: stage.name })}
          >
            ✎
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${stage.name}`}
            disabled={busy}
            onClick={() => run(() => api.deleteStage(stage.id))}
          >
            ×
          </button>
        </span>
      </li>
    )
  }

  return (
    <>
      {stages.length > 0 && <ol className="stages">{stages.map(row)}</ol>}
      <FormError error={error} />
      {!full && (
        <>
          <form className="inline-form" onSubmit={add}>
            <input
              className="input"
              aria-label="New stage"
              placeholder="Add a stage"
              value={newName}
              maxLength={STAGE_NAME_MAX}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="button button--secondary" disabled={busy || !newName.trim()}>
              Add
            </button>
          </form>
          {suggestions.length > 0 && (
            <div className="chips chips--small">
              {suggestions.map((name) => (
                <button key={name} type="button" className="chip chip--add" disabled={busy} onClick={() => add(undefined, name)}>
                  + {name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
