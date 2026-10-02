import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
import { bodyAndPlan } from '~~/test/mocks/handlers/body'
import { baselineProfile } from '~~/test/mocks/handlers/profile'
import { failingRead } from '~~/test/mocks/http'
import { server, useMswServer } from '~~/test/mocks/node'
import WeightHistory from './weight.vue'

useMswServer()

type Reading = components['schemas']['WeightMeasurementResponse']

/** The User has weighed in exactly [readings]. */
const weighed = (...readings: Reading[]) =>
  server.use(...bodyAndPlan({ profile: baselineProfile, readings }))

const reading: Reading = { id: 1, measuredOn: '2026-05-28', weightKg: 84.4 }

describe('/profile/weight history page', () => {
  it('lists every measurement, newest first, with no cap', async () => {
    weighed(
      { id: 1, measuredOn: '2026-05-22', weightKg: 85.0 },
      { id: 2, measuredOn: '2026-05-23', weightKg: 84.9 },
      { id: 3, measuredOn: '2026-05-24', weightKg: 84.8 },
      { id: 4, measuredOn: '2026-05-25', weightKg: 84.7 },
      { id: 5, measuredOn: '2026-05-26', weightKg: 84.6 },
      { id: 6, measuredOn: '2026-05-28', weightKg: 84.4 },
    )
    await renderSuspended(WeightHistory)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent('28 May 2026')
    expect(items[5]).toHaveTextContent('22 May 2026')
  })

  it('titles the page Weight history', async () => {
    weighed(reading)
    await renderSuspended(WeightHistory)

    expect(
      screen.getByRole('heading', { level: 1, name: /weight history/i }),
    ).toBeVisible()
  })

  it('offers a back link to the profile page', async () => {
    weighed(reading)
    await renderSuspended(WeightHistory)

    const back = screen.getByRole('link', { name: /back to profile/i })
    expect(back).toHaveAttribute('href', '/profile')
  })

  it('shows an empty state when there are no readings', async () => {
    weighed()
    await renderSuspended(WeightHistory)

    expect(screen.getByText(/no weight logged yet/i)).toBeVisible()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('exposes no weight-logging control — logging stays on /profile', async () => {
    weighed(reading)
    await renderSuspended(WeightHistory)

    expect(screen.queryByRole('button', { name: /add weight/i })).toBeNull()
    expect(screen.queryByRole('dialog', { name: /log weight/i })).toBeNull()
  })

  it('shows a retryable error instead of the empty state when the history fails to load', async () => {
    server.use(failingRead('/api/weight'))
    await renderSuspended(WeightHistory)

    expect(
      screen.getByRole('heading', {
        name: "Couldn't load your weight history",
      }),
    ).toBeVisible()
    expect(screen.queryByText(/no weight logged yet/i)).not.toBeInTheDocument()
  })
})
