import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import SuspendedDeficitBanner from './SuspendedDeficitBanner.vue'

describe('SuspendedDeficitBanner', () => {
  it('says no deficit is applied and that the user is holding steady', async () => {
    // It states no figure of its own: when the deficit is suspended the Calorie
    // Budget *is* Maintenance, and that figure is on the card directly below
    // (ADR 0030) — restating it would duplicate a number and make the client
    // assert the identity itself.
    await renderSuspended(SuspendedDeficitBanner)

    expect(screen.getByText(/No deficit is being applied/)).toBeVisible()
    expect(screen.getByText(/holding steady, not losing/)).toBeVisible()
  })

  it('offers a way through to ease the goal', async () => {
    // Surfaced, not a fork (ADR 0030): the state lifts by itself if maintenance
    // recovers, so this is an offer rather than a decision the user must make.
    await renderSuspended(SuspendedDeficitBanner)

    expect(
      screen.getByRole('link', { name: 'Ease your goal' }),
    ).toHaveAttribute('href', '/profile')
  })
})
