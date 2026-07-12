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

const cottagePie = {
  id: 4,
  name: 'Cottage Pie',
  kind: 'RECIPE',
  caloriesPer100g: 255,
  proteinPer100g: 30,
  cookedWeightG: 1400,
  ingredientCount: 5,
}

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

  it('bubbles log with the picked food when the user taps a row', async () => {
    const onLog = vi.fn()
    await renderSuspended(FoodList, {
      props: { foods: sampleFoods, onLog },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Log Skyr' }))

    expect(onLog).toHaveBeenCalledWith(sampleFoods[1])
  })

  it('bubbles view with the picked recipe when the user taps its view button', async () => {
    const onView = vi.fn()
    await renderSuspended(FoodList, {
      props: { foods: [...sampleFoods, cottagePie], onView },
    })

    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: 'View ingredients in Cottage Pie' }),
      )

    expect(onView).toHaveBeenCalledWith(cottagePie)
  })

  it("bubbles delete with the picked food when the user activates a row's delete button", async () => {
    const onDelete = vi.fn()
    await renderSuspended(FoodList, {
      props: { foods: sampleFoods, onDelete },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Delete Oats' }))

    expect(onDelete).toHaveBeenCalledWith(sampleFoods[0])
  })
})
