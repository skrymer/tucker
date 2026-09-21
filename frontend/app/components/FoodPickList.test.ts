import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { food, recipe } from '~~/test/food-fixtures'
import FoodPickList from './FoodPickList.vue'

const oats = food({
  id: 1,
  name: 'Rolled oats',
  caloriesPer100g: 379,
  proteinPer100g: 13.2,
})

describe('FoodPickList', () => {
  it('states a row name in sentence case however it was typed', async () => {
    await renderSuspended(FoodPickList, {
      props: { foods: [food({ id: 3, name: 'LIGHT MILK' })] },
    })

    expect(screen.getByText('Light milk')).toBeVisible()
  })

  it('states what a row costs and returns per 100 g, beside its name', async () => {
    await renderSuspended(FoodPickList, { props: { foods: [oats] } })

    const row = screen.getByRole('button', { name: 'Log Rolled oats' })
    expect(row).toBeVisible()
    // The name is read off the accessible label, so the visible one needs its
    // own assertion or a row could render its figures under nothing.
    expect(row).toHaveTextContent('Rolled oats')
    expect(row).toHaveTextContent('379 kcal')
    expect(row).toHaveTextContent('13 g protein /100g')
  })

  it('hands the chosen Food back so the grams sheet knows which one', async () => {
    const user = userEvent.setup()
    const pick = vi.fn()
    await renderSuspended(FoodPickList, {
      props: { foods: [oats], onPick: pick },
    })

    await user.click(screen.getByRole('button', { name: 'Log Rolled oats' }))

    expect(pick).toHaveBeenCalledWith(oats)
  })

  it('marks a Recipe as one, in the row and in its accessible name', async () => {
    await renderSuspended(FoodPickList, {
      props: {
        foods: [
          recipe({
            id: 2,
            name: 'Weekday chilli',
            cookedWeightG: 900,
            ingredientCount: 7,
          }),
        ],
      },
    })

    const row = screen.getByRole('button', {
      name: 'Log Weekday chilli, a recipe',
    })
    // Colour and icon are never the only signal (DESIGN.md), and an icon is
    // nothing at all to a screen reader.
    expect(row).toHaveTextContent('Recipe')
  })
})
