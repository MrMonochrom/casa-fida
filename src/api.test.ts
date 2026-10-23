import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, setUnauthorizedHandler } from './api'
import { makeUser } from './test/fixtures'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  setUnauthorizedHandler(null)
})

function respond(status: number, body?: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

const lastCall = () => fetchMock.mock.calls.at(-1) as [string, RequestInit]

describe('requests', () => {
  it('sends GET requests without a body', async () => {
    const user = makeUser()
    respond(200, { user })
    expect(await api.me()).toEqual(user)
    expect(lastCall()).toEqual(['/api/me', { method: 'GET' }])
  })

  it('sends data as JSON', async () => {
    respond(201, { user: makeUser() })
    await api.signup({ name: 'Emma', email: 'emma@example.com', password: 'secret-pass', role: 'client' })
    const [url, init] = lastCall()
    expect(url).toBe('/api/signup')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Emma',
      email: 'emma@example.com',
      password: 'secret-pass',
      role: 'client',
    })
  })

  it('uploads a photo as the raw file, with its type', async () => {
    respond(201, { photo: { id: 9, url: '/api/photos/9' } })
    const jpeg = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })
    expect(await api.addPhoto(4, jpeg)).toEqual({ id: 9, url: '/api/photos/9' })
    const [url, init] = lastCall()
    expect(url).toBe('/api/updates/4/photos')
    expect(init.body).toBe(jpeg)
    expect(init.headers).toEqual({ 'Content-Type': 'image/jpeg' })
  })

  it('only puts filters that are set in the query string', async () => {
    respond(200, { builders: [] })
    await api.builders('', '')
    expect(lastCall()[0]).toBe('/api/builders')

    respond(200, { builders: [] })
    await api.builders('deck & patio', 'decks_landscaping')
    expect(lastCall()[0]).toBe('/api/builders?q=deck+%26+patio&trade=decks_landscaping')

    respond(200, { jobs: [] })
    await api.openJobs('mine')
    expect(lastCall()[0]).toBe('/api/jobs?trade=mine')
  })

  it('resolves to nothing for "204 No Content"', async () => {
    respond(204)
    await expect(api.deleteProject(3)).resolves.toBeUndefined()
    expect(lastCall()).toEqual(['/api/projects/3', { method: 'DELETE' }])
  })
})

describe('errors', () => {
  it("throws the server's message", async () => {
    respond(409, { error: 'This job is already closed.' })
    await expect(api.closeJob(1)).rejects.toThrow('This job is already closed.')
  })

  it('explains when the server is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api.projects()).rejects.toThrow("Can't reach the server")
  })

  it("explains when the answer isn't JSON (like a proxy error page)", async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(api.projects()).rejects.toThrow("Can't reach the server")
  })

  it('reports a lost session, except for a wrong password when logging in', async () => {
    const lost = vi.fn()
    setUnauthorizedHandler(lost)

    respond(401, { error: 'Wrong email or password.' })
    await expect(api.login('emma@example.com', 'nope')).rejects.toThrow('Wrong email or password.')
    expect(lost).not.toHaveBeenCalled()

    respond(401, { error: 'Please log in again.' })
    await expect(api.projects()).rejects.toThrow('Please log in again.')
    expect(lost).toHaveBeenCalledTimes(1)
  })
})
