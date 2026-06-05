import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import MaintainingTile from './MaintainingTile.vue'

describe('MaintainingTile', () => {
  it('announces that the user is maintaining', async () => {
    await renderSuspended(MaintainingTile, {
      props: { trendWeightKg: 85.8, driftStatus: 'holding' },
    })

    expect(
      screen.getByRole('heading', { level: 2, name: 'Maintaining' }),
    ).toBeVisible()
  })

  it('shows the current trend weight to one decimal place', async () => {
    await renderSuspended(MaintainingTile, {
      props: { trendWeightKg: 85, driftStatus: 'holding' },
    })

    expect(screen.getByText('85.0 kg')).toBeVisible()
  })

  it('shows the drift status as Holding when the trend is holding', async () => {
    await renderSuspended(MaintainingTile, {
      props: { trendWeightKg: 85.8, driftStatus: 'holding' },
    })

    expect(screen.getByText('Holding')).toBeVisible()
  })

  it('reassures that the budget self-corrects when the trend is drifting up', async () => {
    await renderSuspended(MaintainingTile, {
      props: { trendWeightKg: 85.8, driftStatus: 'drifting-up' },
    })

    expect(screen.getByText('Drifting up')).toBeVisible()
    expect(screen.getByText(/your budget will adjust/i)).toBeVisible()
  })

  it('reads as gathering data before fourteen days of measurements exist', async () => {
    await renderSuspended(MaintainingTile, {
      props: { trendWeightKg: 85.8, driftStatus: 'gathering-data' },
    })

    expect(screen.getByText('Gathering data')).toBeVisible()
    // It doesn't claim the trend is steady — drift can't be read yet.
    expect(screen.queryByText(/holding steady/i)).not.toBeInTheDocument()
  })
})
