import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import WeightListItem from './WeightListItem.vue'

describe('WeightListItem', () => {
  it('shows the measurement date and weight', async () => {
    await renderSuspended(WeightListItem, {
      props: {
        measurement: { id: 1, measuredOn: '2026-05-28', weightKg: 84.2 },
      },
    })

    expect(screen.getByText('28 May 2026')).toBeVisible()
    expect(screen.getByText('84.2 kg')).toBeVisible()
  })
})
