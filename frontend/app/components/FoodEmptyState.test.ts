import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import FoodEmptyState from './FoodEmptyState.vue'

describe('FoodEmptyState', () => {
  it('explains the empty state and invites the user to build their catalog', async () => {
    await renderSuspended(FoodEmptyState)

    expect(
      screen.getByRole('heading', { name: /build your food catalog/i }),
    ).toBeVisible()
    expect(screen.getByText(/add the foods you eat regularly/i)).toBeVisible()
  })
})
