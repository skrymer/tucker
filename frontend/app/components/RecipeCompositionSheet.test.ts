import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { getResponse } from 'msw'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { settle } from '~~/test/async-gate'
import { food, recipe, type FoodResponse } from '~~/test/food-fixtures'
import { foodCatalog } from '~~/test/mocks/handlers/catalog'
import { failingRead, held } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import RecipeCompositionSheet from './RecipeCompositionSheet.vue'

const mince = food({
  id: 1,
  name: 'Mince',
  caloriesPer100g: 170,
  proteinPer100g: 20,
})
const potato = food({
  id: 2,
  name: 'Potato',
  caloriesPer100g: 77,
  proteinPer100g: 2,
  carbsPer100g: 17,
})

const cottagePie = recipe({
  id: 4,
  name: 'Cottage Pie',
  caloriesPer100g: 255,
  proteinPer100g: 30,
  cookedWeightG: 1400,
  ingredientCount: 2,
})

const beefStew = recipe({
  id: 5,
  name: 'Beef stew',
  caloriesPer100g: 120,
  proteinPer100g: 9,
  cookedWeightG: 900,
  ingredientCount: 2,
})

/** The catalog the edit builder resolves its pre-filled ingredient lines against. */
const catalog = [mince, potato]

/** Cottage Pie's composition: 500 g of Mince and 900 g of Potato. */
const cottagePieLines = [
  { foodId: 1, grams: 500 },
  { foodId: 2, grams: 900 },
]

/** A catalog holding Cottage Pie and Beef stew, each composed of two lines. */
function kitchen() {
  return foodCatalog({
    foods: [
      ...catalog,
      food({ id: 6, name: 'Beef' }),
      food({ id: 7, name: 'Carrot' }),
      cottagePie,
      beefStew,
    ],
    compositions: {
      4: cottagePieLines,
      5: [
        { foodId: 6, grams: 400 },
        { foodId: 7, grams: 300 },
      ],
    },
  })
}

describe('RecipeCompositionSheet', () => {
  it("lists each ingredient's name and grams for the passed recipe", async () => {
    server.use(...kitchen())
    await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie },
    })

    expect(await screen.findByText('Mince')).toBeVisible()
    expect(screen.getByText('500 g')).toBeVisible()
    expect(screen.getByText('Potato')).toBeVisible()
    expect(screen.getByText('900 g')).toBeVisible()
  })

  it('names the recipe and its ingredients in sentence case', async () => {
    server.use(
      ...foodCatalog({
        foods: [
          food({ id: 1, name: 'LIGHT MILK' }),
          { ...cottagePie, ingredientCount: 1 },
        ],
        compositions: { 4: [{ foodId: 1, grams: 500 }] },
      }),
    )
    await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie },
    })

    expect(await screen.findByText('Light milk')).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Cottage pie' })).toBeVisible()
  })

  it('shows the cooked weight from the composition and the per-100g from the catalog row', async () => {
    // The server holds Cottage Pie at 1,400 g; the catalog row the sheet was
    // handed is an older read, still at 1,200 g.
    server.use(...kitchen())
    await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: { ...cottagePie, cookedWeightG: 1200 } },
    })

    expect(await screen.findByText('Mince')).toBeVisible()
    expect(screen.getByText('1,400 g')).toBeVisible()
    expect(screen.queryByText('1,200 g')).not.toBeInTheDocument()
    expect(screen.getByText('255 kcal')).toBeVisible()
    expect(screen.getByText('30 g protein')).toBeVisible()
  })

  it('surfaces a retryable error and hides the composition when the load fails', async () => {
    let down = true
    server.use(
      failingRead('/api/recipes/{id}', () => down),
      ...kitchen(),
    )
    await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie },
    })

    expect(await screen.findByText("Couldn't load your recipe")).toBeVisible()
    // The ingredient list is not rendered while errored.
    expect(screen.queryByText('Ingredients')).not.toBeInTheDocument()

    down = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Mince')).toBeVisible()
    expect(
      screen.queryByText("Couldn't load your recipe"),
    ).not.toBeInTheDocument()
  })

  it('shows the newly opened recipe, not a still-in-flight previous one', async () => {
    // Cottage Pie's read is held until released; Beef stew's answers at once.
    const cottagePieRead = held('get', '/api/recipes/{id}', (request) =>
      request.url.endsWith('/api/recipes/4'),
    )
    server.use(cottagePieRead.handler, ...kitchen())

    const { rerender } = await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie },
    })
    await cottagePieRead.arrived
    // Switch to Beef stew (as foods.vue does) while Cottage Pie is still loading.
    await rerender({ recipe: beefStew })

    expect(await screen.findByText('Beef')).toBeVisible()
    expect(screen.queryByText('Mince')).not.toBeInTheDocument()

    // Cottage Pie's late response must not clobber the recipe now on screen.
    cottagePieRead.release()
    await settle()
    expect(screen.getByText('Beef')).toBeVisible()
    expect(screen.queryByText('Mince')).not.toBeInTheDocument()
  })

  it('opens the pre-filled edit builder from the composition view', async () => {
    server.use(...kitchen())
    const user = userEvent.setup()
    await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie, foods: catalog },
    })

    // The read-only composition leads; Edit switches it to the seeded builder.
    expect(await screen.findByText('Mince')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /edit recipe/i }))

    // The builder is the edit form, pre-filled from the fetched composition.
    expect(screen.getByLabelText(/recipe name/i)).toHaveDisplayValue(
      'Cottage Pie',
    )
    expect(screen.getByLabelText(/cooked weight/i)).toHaveDisplayValue('1,400')
    expect(screen.getByRole('button', { name: /save changes/i })).toBeVisible()
  })

  it('saves the edited recipe, then closes', async () => {
    const handlers = kitchen()
    server.use(...handlers)
    const onClose = vi.fn()
    const user = userEvent.setup()
    await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie, foods: catalog, onClose },
    })

    await screen.findByText('Mince')
    await user.click(screen.getByRole('button', { name: /edit recipe/i }))
    const cooked = screen.getByLabelText(/cooked weight/i)
    await user.clear(cooked)
    await user.type(cooked, '1500')
    await user.tab()
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    const read = new Request('http://localhost/api/foods')
    const held: FoodResponse[] = await (await getResponse(
      handlers,
      read,
    ))!.json()
    expect(held.find((row) => row.id === cottagePie.id)).toEqual(
      expect.objectContaining({ name: 'Cottage Pie', cookedWeightG: 1500 }),
    )
  })

  it('shows the edited recipe wherever the catalog is shown', async () => {
    server.use(...kitchen())
    const page = defineComponent({
      components: { RecipeCompositionSheet },
      async setup() {
        const { data } = await useFoodCatalog()
        return { data, cottagePie, catalog }
      },
      template: `<ul><li v-for="row in data ?? []" :key="row.id">{{ row.name }} {{ row.cookedWeightG }}</li></ul>
        <RecipeCompositionSheet :recipe="cottagePie" :foods="catalog" />`,
    })
    await renderSuspended(page)
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: /edit recipe/i }),
    )
    const cooked = screen.getByLabelText(/cooked weight/i)
    await user.clear(cooked)
    await user.type(cooked, '1500')
    await user.tab()
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText('Cottage Pie 1500')).toBeVisible()
  })

  it('seeds the edit builder with the Tags read beside the composition, not the catalog row', async () => {
    // The server holds Cottage Pie with "Batch cook"; the catalog row the sheet
    // was handed is an older read, still showing "dinner".
    const handlers = foodCatalog({
      foods: [
        ...catalog,
        { ...cottagePie, tags: [{ id: 7, name: 'Batch cook' }] },
      ],
      compositions: { 4: cottagePieLines },
    })
    server.use(...handlers)
    const onClose = vi.fn()
    const user = userEvent.setup()
    await renderSuspended(RecipeCompositionSheet, {
      props: {
        recipe: { ...cottagePie, tags: [{ id: 9, name: 'dinner' }] },
        foods: catalog,
        onClose,
      },
    })

    await screen.findByText('Mince')
    await user.click(screen.getByRole('button', { name: /edit recipe/i }))
    expect(screen.getByText('Batch cook')).toBeVisible()
    expect(screen.queryByText('dinner')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    const read = new Request('http://localhost/api/foods')
    const held: FoodResponse[] = await (await getResponse(
      handlers,
      read,
    ))!.json()
    expect(held.find((row) => row.id === cottagePie.id)?.tags).toEqual([
      { id: 7, name: 'Batch cook' },
    ])
  })

  it('surfaces an error instead of an empty composition when the recipe is gone', async () => {
    // A recipe deleted between catalog load and view: the server no longer holds it.
    server.use(...foodCatalog({ foods: catalog }))
    await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie },
    })

    expect(await screen.findByText("Couldn't load your recipe")).toBeVisible()
    expect(screen.queryByText('Ingredients')).not.toBeInTheDocument()
  })
})
