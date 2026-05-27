import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import FoodEmptyState from './FoodEmptyState.vue'

describe('FoodEmptyState', () => {
  it('explains the empty state and invites the user to build their catalog', async () => {
    await renderSuspended(FoodEmptyState)

    expect(
      screen.getByRole('heading', { name: /build your food catalog/i }),
    ).toBeVisible()
    expect(screen.getByText(/add the foods you eat regularly/i)).toBeVisible()
  })

  it('invites the user to add their first food', async () => {
    const onAdd = vi.fn()
    await renderSuspended(FoodEmptyState, { props: { onAdd } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /add your first food/i }))

    expect(onAdd).toHaveBeenCalledOnce()
  })
})
