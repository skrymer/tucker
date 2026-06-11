import { describe, expect, it } from 'vitest'
import { renderSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import WeightHistory from './weight.vue'

function mockWeight(
  weights: { id: number; measuredOn: string; weightKg: number }[],
) {
  registerEndpoint('/api/weight', () => weights)
}

describe('/profile/weight history page', () => {
  it('lists every measurement, newest first, with no cap', async () => {
    mockWeight([
      { id: 1, measuredOn: '2026-05-22', weightKg: 85.0 },
      { id: 2, measuredOn: '2026-05-23', weightKg: 84.9 },
      { id: 3, measuredOn: '2026-05-24', weightKg: 84.8 },
      { id: 4, measuredOn: '2026-05-25', weightKg: 84.7 },
      { id: 5, measuredOn: '2026-05-26', weightKg: 84.6 },
      { id: 6, measuredOn: '2026-05-28', weightKg: 84.4 },
    ])
    await renderSuspended(WeightHistory)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent('28 May 2026')
    expect(items[5]).toHaveTextContent('22 May 2026')
  })

  it('titles the page Weight history', async () => {
    mockWeight([{ id: 1, measuredOn: '2026-05-28', weightKg: 84.4 }])
    await renderSuspended(WeightHistory)

    expect(
      screen.getByRole('heading', { level: 1, name: /weight history/i }),
    ).toBeVisible()
  })

  it('offers a back link to the profile page', async () => {
    mockWeight([{ id: 1, measuredOn: '2026-05-28', weightKg: 84.4 }])
    await renderSuspended(WeightHistory)

    const back = screen.getByRole('link', { name: /back to profile/i })
    expect(back).toHaveAttribute('href', '/profile')
  })

  it('shows an empty state when there are no readings', async () => {
    mockWeight([])
    await renderSuspended(WeightHistory)

    expect(screen.getByText(/no weight logged yet/i)).toBeVisible()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('exposes no weight-logging control — logging stays on /profile', async () => {
    mockWeight([{ id: 1, measuredOn: '2026-05-28', weightKg: 84.4 }])
    await renderSuspended(WeightHistory)

    expect(screen.queryByRole('button', { name: /add weight/i })).toBeNull()
    expect(screen.queryByRole('dialog', { name: /log weight/i })).toBeNull()
  })
})
