import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { food, recipe } from '~~/test/food-fixtures'
import FoodListItem from './FoodListItem.vue'

const skyr = food({
  id: 1,
  name: 'Skyr',
  caloriesPer100g: 63.7,
  proteinPer100g: 11.4,
})

const cottagePie = recipe({
  id: 2,
  name: 'Cottage Pie',
  caloriesPer100g: 255,
  proteinPer100g: 30,
  cookedWeightG: 1400,
  ingredientCount: 5,
})

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

  it('marks a recipe with a Recipe chip and an "N ingredients · makes X g" subline', async () => {
    await renderSuspended(FoodListItem, { props: { food: cottagePie } })

    expect(screen.getByText('Recipe')).toBeVisible()
    expect(screen.getByText(/5 ingredients · makes 1,400 g/)).toBeVisible()
  })

  it('reads "1 ingredient" (singular) for a one-ingredient recipe', async () => {
    await renderSuspended(FoodListItem, {
      props: { food: { ...cottagePie, ingredientCount: 1 } },
    })

    expect(screen.getByText(/1 ingredient · makes/)).toBeVisible()
  })

  it('names the Reference Food a matched Food borrows its micronutrients from', async () => {
    await renderSuspended(FoodListItem, {
      props: {
        food: food({
          id: 3,
          name: 'Tasty cheese',
          referenceFoodId: 9,
          referenceFoodName: 'Cheese, cheddar, natural, regular fat',
        }),
      },
    })

    expect(
      screen.getByText(
        'Vitamins and minerals from Cheese, cheddar, natural, regular fat',
      ),
    ).toBeVisible()
  })

  it('says nothing about a borrow to a User who does not count calories', async () => {
    await renderSuspended(FoodListItem, {
      props: {
        food: food({
          id: 3,
          name: 'Tasty cheese',
          referenceFoodId: 9,
          referenceFoodName: 'Cheese, cheddar, natural, regular fat',
        }),
        tracksCalories: false,
      },
    })

    // Gated on the setting, never on whether the row happens to hold a match:
    // a weight-only User who matched foods before turning tracking off would
    // otherwise keep the whole surface (ADR 0027).
    expect(screen.queryByText(/Vitamins and minerals/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /borrows vitamins and minerals/ }),
    ).not.toBeInTheDocument()
  })

  it('emits match — not log — when the user changes what a matched Food borrows', async () => {
    const cheese = food({
      id: 3,
      name: 'Tasty cheese',
      referenceFoodId: 9,
      referenceFoodName: 'Cheese, cheddar, natural, regular fat',
    })
    const onLog = vi.fn()
    const onMatch = vi.fn()
    await renderSuspended(FoodListItem, {
      props: { food: cheese, onLog, onMatch },
    })

    // A wrong match is worse than none, so changing or clearing one has to be as
    // easy as making it — and the queue on /review no longer lists this Food.
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: 'Change what Tasty cheese borrows vitamins and minerals from',
      }),
    )

    expect(onMatch).toHaveBeenCalledWith(cheese)
    expect(onLog).not.toHaveBeenCalled()
  })

  it('leaves an unmatched Food carrying no marker of any kind', async () => {
    await renderSuspended(FoodListItem, { props: { food: skyr } })

    expect(screen.queryByText(/Vitamins and minerals/)).not.toBeInTheDocument()
  })

  it('leaves a plain Food row without a Recipe chip or a view button', async () => {
    await renderSuspended(FoodListItem, { props: { food: skyr } })

    expect(screen.queryByText('Recipe')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /View ingredients/ }),
    ).not.toBeInTheDocument()
  })

  it('emits view — not log — when the user taps a recipe row’s view button', async () => {
    const onLog = vi.fn()
    const onView = vi.fn()
    await renderSuspended(FoodListItem, {
      props: { food: cottagePie, onLog, onView },
    })

    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: 'View ingredients in Cottage Pie' }),
      )

    expect(onView).toHaveBeenCalledWith(cottagePie)
    expect(onLog).not.toHaveBeenCalled()
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
