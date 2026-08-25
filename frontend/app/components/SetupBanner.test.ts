import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { withCalorieTracking } from '~~/test/calorie-tracking-helpers'
import SetupBanner from './SetupBanner.vue'

const bannerFor = (tracksCalories: boolean, setupComplete: boolean) =>
  withCalorieTracking(SetupBanner, tracksCalories, { setupComplete })

describe('SetupBanner', () => {
  it('offers to explain the calorie budget while a tracking User has setup left', async () => {
    await renderSuspended(bannerFor(true, false))

    expect(
      screen.getByText(/finish setup to see your calorie budget/i),
    ).toBeVisible()
  })

  it('asks a weight-only User for their first weight, not for a calorie budget', async () => {
    await renderSuspended(bannerFor(false, false))

    // The same absence, two meanings: this User has no Budget by choice, and
    // offering to explain one would name something they have opted out of.
    expect(screen.getByText(/log your first weight/i)).toBeVisible()
    expect(screen.queryByText(/calorie budget/i)).not.toBeInTheDocument()
  })

  it('stays out of the way once setup is complete, whatever the User tracks', async () => {
    await renderSuspended(bannerFor(true, true))
    expect(screen.queryByText(/finish setup/i)).not.toBeInTheDocument()

    await renderSuspended(bannerFor(false, true))
    expect(screen.queryByText(/log your first weight/i)).not.toBeInTheDocument()
  })

  it('offers a tracking User a call to action that links to the profile', async () => {
    await renderSuspended(bannerFor(true, false))

    const cta = screen.getByRole('link', { name: /finish setup/i })
    expect(cta).toHaveAttribute('href', '/profile')
  })

  it('sends a weight-only User to the profile too, not to whatever sits below', async () => {
    await renderSuspended(bannerFor(false, false))

    // The same banner is hosted by `/` and by `/check`; only one of them has a
    // weight tile under it, so the action cannot be that tile.
    const cta = screen.getByRole('link', { name: /log your weight/i })
    expect(cta).toHaveAttribute('href', '/profile')
  })
})
