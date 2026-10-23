import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db.ts'
import { breakDatabase, createBuilder, createClient, hire, newAgent, resetDb, signUp, validBuilderProfile } from '../test/helpers.ts'
import type { Person } from '../test/helpers.ts'

beforeEach(resetDb)

describe('PUT /api/me/builder-profile', () => {
  it('saves the business profile and returns your account', async () => {
    const bob = await signUp({ role: 'builder' })
    const res = await bob.agent.put('/api/me/builder-profile').send(
      validBuilderProfile({ about: '  Line one\r\nLine two  ', trades: ['roofing', 'roofing', 'kitchens'] }),
    )
    expect(res.status).toBe(200)
    expect(res.body.user.builderProfile).toEqual({
      businessName: 'Solid Builds',
      headline: 'Kitchens and extensions',
      about: 'Line one\nLine two',
      serviceArea: 'Denver, CO',
      yearsInBusiness: 10,
      licenseNumber: 'GC-1',
      insured: true,
      trades: ['kitchens', 'roofing'],
    })
  })

  it('replaces the profile when saved again', async () => {
    const bob = await createBuilder()
    const res = await bob.agent
      .put('/api/me/builder-profile')
      .send(validBuilderProfile({ businessName: 'Renamed', trades: ['roofing'], licenseNumber: '', yearsInBusiness: null, insured: false }))
    expect(res.body.user.builderProfile).toMatchObject({
      businessName: 'Renamed',
      trades: ['roofing'],
      licenseNumber: null,
      yearsInBusiness: null,
      insured: false,
    })
  })

  it.each([
    [{ businessName: '' }, "Please enter your business's name."],
    [{ headline: 'x'.repeat(161) }, 'Keep the headline under 160 characters.'],
    [{ about: ' ' }, 'Tell clients a little about your business.'],
    [{ about: 'x'.repeat(3001) }, 'Keep "About" under 3,000 characters.'],
    [{ serviceArea: '' }, 'Please enter the area you work in.'],
    [{ trades: [] }, 'Choose between 1 and 6 trades.'],
    [{ trades: ['juggling'] }, 'Choose between 1 and 6 trades.'],
    [{ trades: 'roofing' }, 'Choose between 1 and 6 trades.'],
    [
      { trades: ['roofing', 'kitchens', 'bathrooms', 'painting', 'flooring', 'electrical', 'plumbing'] },
      'Choose between 1 and 6 trades.',
    ],
    [{ yearsInBusiness: 2.5 }, 'Years in business should be a whole number.'],
    [{ yearsInBusiness: -1 }, 'Years in business should be a whole number.'],
    [{ licenseNumber: 'x'.repeat(61) }, 'That license number is too long.'],
  ])('refuses %j', async (overrides, error) => {
    const bob = await signUp({ role: 'builder' })
    const res = await bob.agent.put('/api/me/builder-profile').send(validBuilderProfile(overrides))
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(error)
  })

  it('is only for builders', async () => {
    const ana = await createClient()
    const res = await ana.agent.put('/api/me/builder-profile').send(validBuilderProfile())
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Only builders can do that.')
    expect((await newAgent().put('/api/me/builder-profile').send(validBuilderProfile())).status).toBe(401)
  })

  it('keeps the old profile if saving fails part-way', async () => {
    const bob = await createBuilder({ trades: ['roofing'] })
    breakDatabase('INSERT INTO builder_trades')
    const res = await bob.agent.put('/api/me/builder-profile').send(validBuilderProfile({ businessName: 'New', trades: ['kitchens'] }))
    expect(res.status).toBe(500)
    vi.restoreAllMocks()
    const me = (await bob.agent.get('/api/me')).body.user
    expect(me.builderProfile).toMatchObject({ businessName: 'Solid Builds', trades: ['roofing'] })
  })
})

/** Gives a builder a completed project with a review. */
async function review(builder: Person, rating: number) {
  const client = await createClient()
  const projectId = await hire(client, builder)
  await builder.agent.post(`/api/projects/${projectId}/complete`)
  const res = await client.agent.post(`/api/projects/${projectId}/review`).send({ rating, body: `Rated ${rating}` })
  expect(res.status).toBe(201)
  return client
}

describe('GET /api/builders', () => {
  it('lists builders with a profile, best rated first', async () => {
    const ok = await createBuilder({ businessName: 'Okay Co' })
    const great = await createBuilder({ businessName: 'Great Co' })
    await createBuilder({ businessName: 'New Co' })
    await signUp({ role: 'builder' }) // no profile yet
    await review(ok, 3)
    await review(great, 5)
    await review(great, 4)

    const viewer = await createClient()
    const { builders } = (await viewer.agent.get('/api/builders')).body
    expect(builders.map((b: { businessName: string }) => b.businessName)).toEqual(['Great Co', 'Okay Co', 'New Co'])
    expect(builders[0]).toEqual({
      id: great.user.id,
      name: great.name,
      businessName: 'Great Co',
      headline: 'Kitchens and extensions',
      serviceArea: 'Denver, CO',
      trades: ['extensions', 'kitchens'],
      yearsInBusiness: 10,
      licensed: true,
      insured: true,
      rating: 4.5,
      reviewCount: 2,
      completedProjects: 2,
      memberSince: expect.any(Number),
    })
    expect(builders[2]).toMatchObject({ rating: null, reviewCount: 0, completedProjects: 0 })
    // No license number or email in search results.
    expect(JSON.stringify(builders)).not.toContain('GC-1')
    expect(JSON.stringify(builders)).not.toContain('@example.com')
  })

  it('filters by trade', async () => {
    await createBuilder({ businessName: 'Roofers', trades: ['roofing'] })
    await createBuilder({ businessName: 'Kitchens', trades: ['kitchens'] })
    const viewer = await createClient()
    const res = await viewer.agent.get('/api/builders?trade=roofing')
    expect(res.body.builders.map((b: { businessName: string }) => b.businessName)).toEqual(['Roofers'])
    expect((await viewer.agent.get('/api/builders?trade=juggling')).status).toBe(400)
  })

  it('searches names, headlines and service areas', async () => {
    await createBuilder({ businessName: 'Peak Roofing', serviceArea: 'Boulder, CO' })
    await createBuilder({ businessName: 'Valley Homes', headline: 'Custom homes 100% on time', serviceArea: 'Aurora, CO' })
    const viewer = await createClient()
    const names = async (q: string) =>
      (await viewer.agent.get('/api/builders').query({ q })).body.builders.map((b: { businessName: string }) => b.businessName)
    expect(await names('boulder')).toEqual(['Peak Roofing'])
    expect(await names('homes')).toEqual(['Valley Homes'])
    expect(await names('100%')).toEqual(['Valley Homes'])
    // % and _ are searched for as themselves.
    expect(await names('%')).toEqual(['Valley Homes'])
    expect(await names('_')).toEqual([])
  })

  it('needs you to be logged in', async () => {
    expect((await newAgent().get('/api/builders')).status).toBe(401)
  })
})

describe('GET /api/builders/:id', () => {
  it('shows the full profile with reviews, newest first, by first name and initial', async () => {
    const bob = await createBuilder({ about: 'All about us.' })
    const first = await review(bob, 4)
    await db.query("UPDATE reviews SET created_at = NOW() - INTERVAL 1 DAY")
    await db.query('UPDATE users SET name = ? WHERE id = ?', ['Emma Clarke', first.user.id])
    await review(bob, 5)

    const viewer = await createClient()
    const res = await viewer.agent.get(`/api/builders/${bob.user.id}`)
    expect(res.status).toBe(200)
    expect(res.body.builder).toMatchObject({ businessName: 'Solid Builds', about: 'All about us.', licenseNumber: 'GC-1', rating: 4.5 })
    expect(res.body.builder.reviews).toEqual([
      expect.objectContaining({ rating: 5, body: 'Rated 5', projectTitle: 'New kitchen' }),
      expect.objectContaining({ rating: 4, author: 'Emma C.' }),
    ])
  })

  it("is 404 for someone who isn't a builder with a profile", async () => {
    const viewer = await createClient()
    const noProfile = await signUp({ role: 'builder' })
    for (const id of [viewer.user.id, noProfile.user.id, 999999, 'abc']) {
      const res = await viewer.agent.get(`/api/builders/${id}`)
      expect(res.status).toBe(404)
      expect(res.body.error).toBe("This builder doesn't have a profile.")
    }
  })
})
