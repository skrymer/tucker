import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import FoodListItem from './FoodListItem.vue'

const skyr = {
  id: 1,
  name: 'Skyr',
  kind: 'raw',
  caloriesPer100g: 63.7,
  proteinPer100g: 11.4,
}

describe('FoodListItem', () => {
  it("shows the food's name with rounded per-100g calories and protein", async () => {
    await renderSuspended(FoodListItem, { props: { food: skyr } })

    expect(screen.getByText('Skyr')).toBeVisible()
    expect(screen.getByText(/64 kcal/)).toBeVisible()
    expect(screen.getByText(/11 g protein/)).toBeVisible()
  })

  it('emits log with the food when the user taps the row', async () => {
    const onLog = vi.fn()
    await renderSuspended(FoodListItem, {
      props: { food: skyr, onLog },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Log Skyr' }))

    expect(onLog).toHaveBeenCalledWith(skyr)
  })

  it('emits delete — not log — when the user activates the delete button', async () => {
    const onLog = vi.fn()
    const onDelete = vi.fn()
    await renderSuspended(FoodListItem, {
      props: { food: skyr, onLog, onDelete },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Delete Skyr' }))

    expect(onDelete).toHaveBeenCalledWith(skyr)
    expect(onLog).not.toHaveBeenCalled()
  })
})
