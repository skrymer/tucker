import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import FoodList from './FoodList.vue'

const sampleFoods = [
  {
    id: 1,
    name: 'Oats',
    kind: 'raw',
    caloriesPer100g: 380,
    proteinPer100g: 13,
  },
  { id: 2, name: 'Skyr', kind: 'raw', caloriesPer100g: 64, proteinPer100g: 11 },
  {
    id: 3,
    name: 'Chicken breast',
    kind: 'raw',
    caloriesPer100g: 165,
    proteinPer100g: 31,
  },
]

describe('FoodList', () => {
  it('renders one row per food in a single accessible list', async () => {
    await renderSuspended(FoodList, { props: { foods: sampleFoods } })

    const list = screen.getByRole('list')
    expect(list).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    expect(screen.getByText('Oats')).toBeVisible()
    expect(screen.getByText('Skyr')).toBeVisible()
    expect(screen.getByText('Chicken breast')).toBeVisible()
  })
})
