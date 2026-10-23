import { describe, expect, it } from 'vitest'
import { en } from './en.ts'
import { ro } from './ro.ts'
import { ru } from './ru.ts'

/** Every message's path and kind ('text', or a function's number of arguments). */
function shape(messages: object, prefix = ''): Record<string, string> {
  const found: Record<string, string> = {}
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix + key
    if (typeof value === 'string') found[path] = 'text'
    else if (typeof value === 'function') found[path] = `function(${value.length})`
    else Object.assign(found, shape(value, `${path}.`))
  }
  return found
}

describe('server messages', () => {
  it.each([
    ['Romanian', ro],
    ['Russian', ru],
  ])('has every English message in %s', (_name, messages) => {
    expect(shape(messages)).toEqual(shape(en))
  })

  it.each([
    ['Romanian', ro],
    ['Russian', ru],
  ])('has no English left in %s', (_name, messages) => {
    const english = shape(en)
    for (const path of Object.keys(english)) {
      if (english[path] !== 'text') continue
      const read = (m: object) => path.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], m)
      expect(read(messages), path).not.toBe(read(en))
    }
  })
})
