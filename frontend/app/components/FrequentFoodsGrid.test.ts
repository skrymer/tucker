import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { food, recipe } from '~~/test/food-fixtures'
import FrequentFoodsGrid from './FrequentFoodsGrid.vue'

const oats = food({
  id: 1,
  name: 'Rolled oats',
  caloriesPer100g: 379,
  proteinPer100g: 13.2,
})

describe('FrequentFoodsGrid', () => {
  it('states what a cell costs and returns per 100 g, beside its name', async () => {
    await renderSuspended(FrequentFoodsGrid, { props: { foods: [oats] } })

    const cell = screen.getByRole('button', { name: /Rolled oats/ })
    expect(cell).toBeVisible()
    expect(cell).toHaveTextContent('379 kcal')
    expect(cell).toHaveTextContent('13 g protein /100g')
  })

  it('marks a Recipe as one in the cell accessible name', async () => {
    await renderSuspended(FrequentFoodsGrid, {
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

    // Named rather than only drawn: the marker is a pot icon, which is nothing
    // at all to a screen reader, and the grid is a phone's whole logging surface.
    expect(
      screen.getByRole('button', { name: 'Log Weekday chilli, a recipe' }),
    ).toBeVisible()
  })

  it('hands the chosen Food back so the grams sheet knows which one', async () => {
    const user = userEvent.setup()
    const pick = vi.fn()
    await renderSuspended(FrequentFoodsGrid, {
      props: { foods: [oats], onPick: pick },
    })

    await user.click(screen.getByRole('button', { name: 'Log Rolled oats' }))

    expect(pick).toHaveBeenCalledWith(oats)
  })

  it('keeps the backend order rather than sorting again', async () => {
    // The ranking is the backend's (ADR 0002, ADR 0028) — a grid that sorted by
    // name would silently answer a different question than the one asked.
    await renderSuspended(FrequentFoodsGrid, {
      props: {
        foods: [
          food({ id: 3, name: 'Zucchini' }),
          oats,
          food({ id: 4, name: 'Almonds' }),
        ],
      },
    })

    expect(
      screen.getAllByRole('button').map((cell) => cell.textContent!.trim()),
    ).toEqual([
      expect.stringContaining('Zucchini'),
      expect.stringContaining('Rolled oats'),
      expect.stringContaining('Almonds'),
    ])
  })
})
