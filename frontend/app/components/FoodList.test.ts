import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
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

  it('bubbles select with the picked food when the user clicks a row', async () => {
    const onSelect = vi.fn()
    await renderSuspended(FoodList, {
      props: { foods: sampleFoods, onSelect },
    })

    await userEvent.setup().click(screen.getByRole('button', { name: /skyr/i }))

    expect(onSelect).toHaveBeenCalledWith(sampleFoods[1])
  })
})
