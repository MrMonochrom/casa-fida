import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { AuthScreen } from '../screens/AuthScreen'
import { resetApiMocks } from '../test/mockApi'
import { makeUser } from '../test/fixtures'
import { visit } from '../test/render'
import { en } from './en'
import { fill, getLanguage, setLanguage } from './index'
import { ro } from './ro'
import { ru } from './ru'

vi.mock('../api')

beforeEach(resetApiMocks)

/** Every text's path and kind: 'text', 'function', or a list's length. */
function shape(messages: object, prefix = ''): Record<string, string> {
  const found: Record<string, string> = {}
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix + key
    if (typeof value === 'string') found[path] = 'text'
    else if (typeof value === 'function') found[path] = 'function'
    else {
      if (Array.isArray(value)) found[path] = `list of ${value.length}`
      Object.assign(found, shape(value, `${path}.`))
    }
  }
  return found
}

const read = (messages: object, path: string) =>
  path.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], messages)

// Words that are the same in English.
const SAME = new Set(['common.email', 'jobs.client', 'projects.client', 'common.placePlaceholder'])

describe('translations', () => {
  it.each([
    ['Romanian', ro],
    ['Russian', ru],
  ])('has every English text in %s, and no English left over', (_name, messages) => {
    expect(shape(messages)).toEqual(shape(en))
    for (const [path, kind] of Object.entries(shape(en))) {
      if (kind === 'text' && !SAME.has(path)) expect(read(messages, path), path).not.toBe(read(en, path))
    }
  })

  it('puts elements into a text', () => {
    render(<p>{fill('You hired {builder} for {price}.', { builder: <strong>Reid</strong>, price: '$5' })}</p>)
    expect(screen.getByText('Reid').tagName).toBe('STRONG')
    expect(screen.getByText(/You hired/)).toHaveTextContent('You hired Reid for $5.')
  })
})

describe('switching language', () => {
  it('changes the whole app from the top bar on any page, and tells the page and the server', async () => {
    visit('/projects')
    render(<App user={makeUser()} onUserChange={vi.fn()} onLogout={vi.fn()} />)
    expect(getLanguage()).toBe('en')
    const topBar = () => within(screen.getByRole('banner'))
    expect(topBar().getByRole('combobox', { name: 'Language' })).toHaveDisplayValue('EN')

    await userEvent.selectOptions(topBar().getByRole('combobox', { name: 'Language' }), 'ro')
    const menu = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(menu).getByRole('link', { name: /Acasă/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Proiecte' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('ro')
    expect(document.cookie).toContain('cf_lang=ro')
    expect(localStorage.getItem('cf_lang')).toBe('ro')

    await userEvent.selectOptions(topBar().getByRole('combobox', { name: 'Limba' }), 'ru')
    expect(within(screen.getByRole('navigation', { name: 'Главное меню' })).getByRole('link', { name: /Проекты/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Проекты' })).toBeInTheDocument()
    expect(document.cookie).toContain('cf_lang=ru')
  })

  it('names each language in itself on the login page', async () => {
    setLanguage('ru')
    render(<AuthScreen onAuthenticated={vi.fn()} />)
    const picker = screen.getByRole('combobox', { name: 'Язык' })
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['English', 'Română', 'Русский'])
    await userEvent.selectOptions(picker, 'en')
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('is no longer on the Account page, since the top bar has it', () => {
    visit('/account')
    render(<App user={makeUser()} onUserChange={vi.fn()} onLogout={vi.fn()} />)
    expect(within(screen.getByRole('main')).queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument()
  })
})
