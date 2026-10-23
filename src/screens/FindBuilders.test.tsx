import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { makeBuilderCard, makeBuilderDetail, makeBuilderUser, makeUser } from '../test/fixtures'
import { resetApiMocks } from '../test/mockApi'
import { renderAs } from '../test/render'
import { BuilderPage } from './BuilderPage'
import { FindBuilders } from './FindBuilders'

vi.mock('../api')

beforeEach(resetApiMocks)

describe('FindBuilders', () => {
  it('shows builders with their rating and credentials', async () => {
    vi.mocked(api.builders).mockResolvedValue([
      makeBuilderCard({ id: 4, businessName: 'Ortiz Outdoor Living', rating: 4, reviewCount: 1, licensed: false }),
      makeBuilderCard({ id: 6, businessName: 'Kim Renovation Co.', rating: null, reviewCount: 0 }),
    ])
    renderAs(makeUser(), <FindBuilders />)
    expect(await screen.findByRole('link', { name: /Ortiz Outdoor Living/ })).toHaveAttribute('href', '/builders/4')
    expect(screen.getByLabelText('Rated 4 out of 5 from 1 review')).toBeInTheDocument()
    expect(screen.getByText('No reviews yet')).toBeInTheDocument()
    expect(screen.getByText('2 builders')).toBeInTheDocument()
  })

  it('searches after a pause in typing, and filters by trade', async () => {
    renderAs(makeUser(), <FindBuilders />)
    await waitFor(() => expect(api.builders).toHaveBeenCalledWith('', ''))

    await userEvent.type(screen.getByLabelText('Search builders'), 'denver')
    await waitFor(() => expect(api.builders).toHaveBeenLastCalledWith('denver', ''))
    // Not once per letter.
    expect(vi.mocked(api.builders).mock.calls.filter(([q]) => q && q !== 'denver')).toEqual([])

    await userEvent.selectOptions(screen.getByLabelText('Trade'), 'roofing')
    await waitFor(() => expect(api.builders).toHaveBeenLastCalledWith('denver', 'roofing'))
  })
})

describe('BuilderPage', () => {
  it('shows a builder’s profile and reviews, and lets a client message them', async () => {
    vi.mocked(api.builder).mockResolvedValue(
      makeBuilderDetail({
        id: 4,
        name: 'Lena Ortiz',
        businessName: 'Ortiz Outdoor Living',
        reviews: [
          { id: 1, rating: 4, body: 'Solid deck.', author: 'Olivia B.', projectTitle: 'Cedar deck', createdAt: Date.now() },
        ],
      }),
    )
    renderAs(makeUser(), <BuilderPage id={4} />)
    expect(await screen.findByRole('heading', { name: 'Ortiz Outdoor Living' })).toBeInTheDocument()
    expect(screen.getByText('Solid deck.')).toBeInTheDocument()
    expect(screen.getByText(/Olivia B\./)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Message Lena' }))
    expect(api.openConversation).toHaveBeenCalledWith(4)
    await waitFor(() => expect(window.location.pathname).toBe('/messages/77'))
  })

  it('lets builders see their own profile, with a link to edit it', async () => {
    renderAs(makeBuilderUser({ id: 2 }), <BuilderPage id={2} />)
    expect(await screen.findByRole('link', { name: 'Edit your profile' })).toHaveAttribute('href', '/account')
    expect(screen.queryByRole('button', { name: /Message/ })).not.toBeInTheDocument()
  })
})
