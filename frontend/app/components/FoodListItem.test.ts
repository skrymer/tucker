import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
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

  it('leaves the row body inert — the catalog does not log', async () => {
    await renderSuspended(FoodListItem, { props: { food: skyr } })

    // Logging is its own destination (ADR 0028), so the row states the Food and
    // offers only the catalog's own actions.
    expect(screen.queryByRole('button', { name: /^Log Skyr$/ })).toBeNull()
    expect(screen.getByText('Skyr')).toBeVisible()
  })

  it('states the name in sentence case however it was typed', async () => {
    await renderSuspended(FoodListItem, {
      props: { food: food({ id: 3, name: 'LIGHT MILK' }) },
    })

    expect(screen.getByText('Light milk')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Delete Light milk' }),
    ).toBeVisible()
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

  it('emits match when the user changes what a matched Food borrows', async () => {
    const cheese = food({
      id: 3,
      name: 'Tasty cheese',
      referenceFoodId: 9,
      referenceFoodName: 'Cheese, cheddar, natural, regular fat',
    })
    const onMatch = vi.fn()
    await renderSuspended(FoodListItem, {
      props: { food: cheese, onMatch },
    })

    // A wrong match is worse than none, so changing or clearing one has to be as
    // easy as making it — and the queue on /review no longer lists this Food.
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: 'Change what Tasty cheese borrows vitamins and minerals from',
      }),
    )

    expect(onMatch).toHaveBeenCalledWith(cheese)
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

  it('emits view when the user taps a recipe row’s view button', async () => {
    const onView = vi.fn()
    await renderSuspended(FoodListItem, {
      props: { food: cottagePie, onView },
    })

    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: 'View ingredients in Cottage pie' }),
      )

    expect(onView).toHaveBeenCalledWith(cottagePie)
  })

  it('lists the Tags a Food carries, each spelled as its User gave it', async () => {
    await renderSuspended(FoodListItem, {
      props: {
        food: food({
          id: 4,
          name: 'Rolled oats',
          tags: [
            { id: 1, name: 'Breakfast' },
            { id: 2, name: 'post-workout' },
          ],
        }),
      },
    })

    const tags = screen.getByRole('list', { name: 'Tags on Rolled oats' })
    expect(
      within(tags)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['Breakfast', 'post-workout'])
  })

  it('shows four of six Tags and a "+2" that opens the Food’s Tags', async () => {
    const oats = food({
      id: 4,
      name: 'Rolled oats',
      tags: ['a', 'b', 'c', 'd', 'e', 'f'].map((name, i) => ({ id: i, name })),
    })
    const onTag = vi.fn()
    await renderSuspended(FoodListItem, { props: { food: oats, onTag } })

    const tags = screen.getByRole('list', { name: 'Tags on Rolled oats' })
    expect(
      within(tags)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['a', 'b', 'c', 'd', '+2'])

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: '2 more tags on Rolled oats' }))

    expect(onTag).toHaveBeenCalledWith(oats)
  })

  it('emits tag when the user opens a Food’s Tags from its row', async () => {
    const onTag = vi.fn()
    await renderSuspended(FoodListItem, { props: { food: skyr, onTag } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Tags for Skyr' }))

    expect(onTag).toHaveBeenCalledWith(skyr)
  })

  it('emits delete when the user activates the delete button', async () => {
    const onDelete = vi.fn()
    await renderSuspended(FoodListItem, {
      props: { food: skyr, onDelete },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Delete Skyr' }))

    expect(onDelete).toHaveBeenCalledWith(skyr)
  })
})
