import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { deferred } from './test/fixtures'
import { useResource } from './useResource'

interface Controls {
  reload: () => Promise<void>
  setData: (value: string) => void
}

interface ProbeProps {
  load: (id: string) => Promise<string>
  id: string
  /** Hands the test the hook's reload and setData. */
  expose?: (controls: Controls) => void
}

function Probe({ load, id, expose }: ProbeProps) {
  const { data, error, reload, setData } = useResource(() => load(id), id)
  useEffect(() => {
    expose?.({ reload, setData })
  }, [expose, reload, setData])
  return (
    <p data-testid="probe">
      {data ?? 'loading'}
      {error ? ` | error: ${error}` : ''}
    </p>
  )
}

const shown = () => screen.getByTestId('probe').textContent

describe('useResource', () => {
  it('loads when it appears', async () => {
    render(<Probe load={async (id) => `project ${id}`} id="1" />)
    expect(shown()).toBe('loading')
    expect(await screen.findByText('project 1')).toBeInTheDocument()
  })

  it('loads again, without showing the old data, when the key changes', async () => {
    const second = deferred<string>()
    const load = vi.fn(async (id: string) => (id === '1' ? 'project 1' : second.promise))
    const { rerender } = render(<Probe load={load} id="1" />)
    await screen.findByText('project 1')

    rerender(<Probe load={load} id="2" />)
    expect(shown()).toBe('loading')
    await act(async () => second.resolve('project 2'))
    expect(shown()).toBe('project 2')
  })

  it('ignores an older answer that arrives after a newer one', async () => {
    let controls!: Controls
    const expose = (c: Controls) => (controls = c)
    const slow = deferred<string>()
    const fast = deferred<string>()
    const answers = [Promise.resolve('first'), slow.promise, fast.promise]
    render(<Probe load={() => answers.shift()!} id="1" expose={expose} />)
    await screen.findByText('first')

    let slowReload!: Promise<void>
    let fastReload!: Promise<void>
    act(() => {
      slowReload = controls.reload()
      fastReload = controls.reload()
    })
    await act(async () => {
      fast.resolve('newest')
      await fastReload
    })
    await act(async () => {
      slow.resolve('stale')
      await slowReload
    })
    expect(shown()).toBe('newest')
  })

  it('keeps showing the data when a refresh fails', async () => {
    let controls!: Controls
    const expose = (c: Controls) => (controls = c)
    // Made when asked for, so the failure isn't an unhandled rejection before then.
    const answers = [async () => 'project 1', async () => Promise.reject(new Error('Offline'))]
    render(<Probe load={() => answers.shift()!()} id="1" expose={expose} />)
    await screen.findByText('project 1')
    await act(() => controls.reload())
    expect(shown()).toBe('project 1 | error: Offline')
  })

  it('takes a fresh copy from a change, over a refresh still on its way', async () => {
    let controls!: Controls
    const expose = (c: Controls) => (controls = c)
    const refresh = deferred<string>()
    const answers = [Promise.resolve('before'), refresh.promise]
    render(<Probe load={() => answers.shift()!} id="1" expose={expose} />)
    await screen.findByText('before')

    let pending!: Promise<void>
    act(() => {
      pending = controls.reload()
    })
    act(() => controls.setData('after the change'))
    await act(async () => {
      refresh.resolve('older refresh')
      await pending
    })
    expect(shown()).toBe('after the change')
  })
})
