import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Link } from './components/Link'
import { idParam, matchPath, navigate, usePath, useSearchParams } from './router'

function WhereAmI() {
  const path = usePath()
  const params = useSearchParams()
  return (
    <p data-testid="where">
      {path}
      {params.get('tab') ? ` (${params.get('tab')})` : ''}
    </p>
  )
}

describe('matchPath', () => {
  it('reads the named parts of a path', () => {
    expect(matchPath('/projects/:id', '/projects/12')).toEqual({ id: '12' })
    expect(matchPath('/jobs/:id/edit', '/jobs/3/edit')).toEqual({ id: '3' })
    expect(matchPath('/projects', '/projects/')).toEqual({})
  })

  it("doesn't match other paths", () => {
    expect(matchPath('/projects/:id', '/projects')).toBeNull()
    expect(matchPath('/projects/:id', '/jobs/12')).toBeNull()
    expect(matchPath('/jobs/:id', '/jobs/3/edit')).toBeNull()
  })
})

describe('idParam', () => {
  it('only accepts positive whole numbers', () => {
    expect(idParam('12')).toBe(12)
    expect(idParam('0')).toBeNull()
    expect(idParam('-1')).toBeNull()
    expect(idParam('1.5')).toBeNull()
    expect(idParam('abc')).toBeNull()
    expect(idParam(undefined)).toBeNull()
  })
})

describe('navigation', () => {
  it('moves to another page, and back', async () => {
    render(<WhereAmI />)
    expect(screen.getByTestId('where')).toHaveTextContent('/')

    act(() => navigate('/projects/4?tab=money'))
    expect(screen.getByTestId('where')).toHaveTextContent('/projects/4 (money)')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)

    act(() => navigate('/messages'))
    expect(screen.getByTestId('where')).toHaveTextContent('/messages')

    await act(async () => {
      window.history.back()
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }))
    })
    expect(screen.getByTestId('where')).toHaveTextContent('/projects/4 (money)')
  })

  it('can replace the current page instead of adding one', () => {
    const before = window.history.length
    act(() => navigate('/jobs', { replace: true }))
    expect(window.location.pathname).toBe('/jobs')
    expect(window.history.length).toBe(before)
  })

  it('follows links without reloading the page', async () => {
    render(
      <>
        <WhereAmI />
        <Link to="/builders/3">Reid &amp; Sons</Link>
      </>,
    )
    await userEvent.click(screen.getByRole('link', { name: 'Reid & Sons' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/builders/3')
    expect(screen.getByRole('link', { name: 'Reid & Sons' })).toHaveAttribute('href', '/builders/3')
  })

  it('leaves Cmd/Ctrl-clicks to the browser, for a new tab', async () => {
    render(
      // jsdom can't open new tabs, so the click stops here once the link has let it through.
      <div onClick={(e) => e.preventDefault()}>
        <WhereAmI />
        <Link to="/builders/3">Reid &amp; Sons</Link>
      </div>,
    )
    const user = userEvent.setup()
    await user.keyboard('{Meta>}')
    await user.click(screen.getByRole('link', { name: 'Reid & Sons' }))
    await user.keyboard('{/Meta}')
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/)
  })
})
