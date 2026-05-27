import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
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
})
