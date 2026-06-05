import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import MaintainingTile from './MaintainingTile.vue'

describe('MaintainingTile', () => {
  it('announces that the user is maintaining', async () => {
    await renderSuspended(MaintainingTile, { props: { trendWeightKg: 85.8 } })

    expect(
      screen.getByRole('heading', { level: 2, name: 'Maintaining' }),
    ).toBeVisible()
  })

  it('shows the current trend weight to one decimal place', async () => {
    await renderSuspended(MaintainingTile, { props: { trendWeightKg: 85 } })

    expect(screen.getByText('85.0 kg')).toBeVisible()
  })
})
