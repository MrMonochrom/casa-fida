import { useState } from 'react'
import { STAGES_MAX, STAGE_NAME_MAX, STAGE_SUGGESTIONS } from '../../shared/rules'

interface Props {
  value: string[]
  onChange: (stages: string[]) => void
}

/** Picking a new project's stages: suggestions to add with one click, your own, and their order. */
export function StageListEditor({ value, onChange }: Props) {
  const [custom, setCustom] = useState('')
  const full = value.length >= STAGES_MAX
  const suggestions = STAGE_SUGGESTIONS.filter((s) => !value.includes(s))

  function add(name: string) {
    const trimmed = name.trim()
    if (!trimmed || value.includes(trimmed) || full) return
    onChange([...value, trimmed])
  }

  function move(index: number, by: -1 | 1) {
    const next = [...value]
    ;[next[index], next[index + by]] = [next[index + by], next[index]]
    onChange(next)
  }

  return (
    <fieldset className="field">
      <legend className="field__label">
        Stages <span className="field__extra">(optional)</span>
      </legend>
      <p className="field__hint">Your client follows the project's progress through these. You can change them later.</p>
      {value.length > 0 && (
        <ol className="stage-draft">
          {value.map((name, i) => (
            <li key={name} className="stage-draft__row">
              <span className="stage-draft__number">{i + 1}</span>
              <span className="stage-draft__name">{name}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${name} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${name} down`}
                disabled={i === value.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${name}`}
                onClick={() => onChange(value.filter((s) => s !== name))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      {suggestions.length > 0 && !full && (
        <div className="chips">
          {suggestions.map((name) => (
            <button key={name} type="button" className="chip chip--add" onClick={() => add(name)}>
              + {name}
            </button>
          ))}
        </div>
      )}
      <div className="inline-form">
        <input
          className="input"
          aria-label="Your own stage"
          placeholder="Add your own stage"
          value={custom}
          maxLength={STAGE_NAME_MAX}
          disabled={full}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(custom)
              setCustom('')
            }
          }}
        />
        <button
          type="button"
          className="button button--secondary"
          disabled={!custom.trim() || full}
          onClick={() => {
            add(custom)
            setCustom('')
          }}
        >
          Add
        </button>
      </div>
    </fieldset>
  )
}
