import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import SuspendedDeficitBanner from './SuspendedDeficitBanner.vue'

describe('SuspendedDeficitBanner', () => {
  it('names the rate that outran maintenance and says the user is holding steady', async () => {
    await renderSuspended(SuspendedDeficitBanner, {
      props: { rateKgPerWeek: 1.5 },
    })

    expect(screen.getByText(/1\.5 kg a week/)).toBeVisible()
    expect(screen.getByText(/holding steady, not losing/)).toBeVisible()
  })

  it('offers a way through to ease the goal', async () => {
    // Surfaced, not a fork (ADR 0030): the state lifts by itself if maintenance
    // recovers, so this is an offer rather than a decision the user must make.
    await renderSuspended(SuspendedDeficitBanner, {
      props: { rateKgPerWeek: 1.5 },
    })

    expect(
      screen.getByRole('link', { name: 'Ease your goal' }),
    ).toHaveAttribute('href', '/profile')
  })
})
