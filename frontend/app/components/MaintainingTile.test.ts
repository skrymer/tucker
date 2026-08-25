import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { withCalorieTracking } from '~~/test/calorie-tracking-helpers'
import MaintainingTile from './MaintainingTile.vue'

const tileFor = (
  tracksCalories: boolean,
  driftStatus: DriftStatus,
  trendWeightKg = 85.8,
) =>
  withCalorieTracking(MaintainingTile, tracksCalories, {
    trendWeightKg,
    driftStatus,
  })

describe('MaintainingTile', () => {
  it('announces that the user is maintaining', async () => {
    await renderSuspended(tileFor(true, 'holding'))

    expect(
      screen.getByRole('heading', { level: 2, name: 'Maintaining' }),
    ).toBeVisible()
  })

  it('shows the current trend weight to one decimal place', async () => {
    await renderSuspended(tileFor(true, 'holding', 85))

    expect(screen.getByText('85.0 kg')).toBeVisible()
  })

  it('shows the drift status as Holding when the trend is holding', async () => {
    await renderSuspended(tileFor(true, 'holding'))

    expect(screen.getByText('Holding')).toBeVisible()
    expect(
      screen.getByText(/holding steady at your trend weight/i),
    ).toBeVisible()
  })

  it('reassures that the budget self-corrects when the trend is drifting up', async () => {
    await renderSuspended(tileFor(true, 'drifting-up'))

    expect(screen.getByText('Drifting up')).toBeVisible()
    expect(screen.getByText(/your budget will adjust/i)).toBeVisible()
  })

  it('reads as gathering data before fourteen days of measurements exist', async () => {
    await renderSuspended(tileFor(true, 'gathering-data'))

    expect(screen.getByText('Gathering data')).toBeVisible()
    // It doesn't claim the trend is steady — drift can't be read yet.
    expect(screen.queryByText(/holding steady/i)).not.toBeInTheDocument()
  })

  it('reassures that the budget self-corrects when the trend is drifting down', async () => {
    await renderSuspended(tileFor(true, 'drifting-down'))

    expect(screen.getByText('Drifting down')).toBeVisible()
    expect(screen.getByText(/your budget will adjust/i)).toBeVisible()
  })

  it('states a weight-only User drifting down without naming a budget', async () => {
    // Both drifting states close on the Budget for a tracking User, so both need
    // the weight-only wording — one tested arm would leave the other free to
    // ship budget copy to a User who has none.
    await renderSuspended(tileFor(false, 'drifting-down'))

    expect(screen.getByText('Drifting down')).toBeVisible()
    expect(screen.getByText(/trending down/i)).toBeVisible()
    expect(screen.queryByText(/budget/i)).not.toBeInTheDocument()
  })

  it('promises a weight-only User no budget adjustment they will never see', async () => {
    await renderSuspended(tileFor(false, 'drifting-up'))

    // The Budget is what corrects drift for a tracking User (ADR 0008). This one
    // has none, so naming it would promise a correction that is not coming.
    expect(screen.getByText('Drifting up')).toBeVisible()
    expect(screen.getByText(/trending up/i)).toBeVisible()
    expect(screen.queryByText(/budget/i)).not.toBeInTheDocument()
  })

  it('reads the same to either User where the Budget plays no part', async () => {
    await renderSuspended(tileFor(false, 'holding'))

    // Holding steady and gathering data are statements about the trend alone, so
    // there is nothing for Calorie Tracking to change about them.
    expect(
      screen.getByText(/holding steady at your trend weight/i),
    ).toBeVisible()
  })
})
