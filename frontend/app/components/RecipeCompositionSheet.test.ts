import { describe, expect, it, vi } from 'vitest'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { setResponseStatus } from 'h3'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import RecipeCompositionSheet from './RecipeCompositionSheet.vue'

const cottagePie = {
  id: 4,
  name: 'Cottage Pie',
  kind: 'RECIPE',
  caloriesPer100g: 255,
  proteinPer100g: 30,
  cookedWeightG: 1400,
  ingredientCount: 2,
}

const composition = {
  id: 4,
  name: 'Cottage Pie',
  cookedWeightG: 1400,
  ingredients: [
    { foodId: 1, name: 'Mince', grams: 500 },
    { foodId: 2, name: 'Potato', grams: 900 },
  ],
}

const beefStew = {
  id: 5,
  name: 'Beef stew',
  kind: 'RECIPE',
  caloriesPer100g: 120,
  proteinPer100g: 9,
  cookedWeightG: 900,
  ingredientCount: 2,
}

const stewComposition = {
  id: 5,
  name: 'Beef stew',
  cookedWeightG: 900,
  ingredients: [
    { foodId: 6, name: 'Beef', grams: 400 },
    { foodId: 7, name: 'Carrot', grams: 300 },
  ],
}

describe('RecipeCompositionSheet', () => {
  it("lists each ingredient's name and grams for the passed recipe", async () => {
    registerEndpoint('/api/recipes/4', () => composition)
    await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie },
    })

    expect(await screen.findByText('Mince')).toBeVisible()
    expect(screen.getByText('500 g')).toBeVisible()
    expect(screen.getByText('Potato')).toBeVisible()
    expect(screen.getByText('900 g')).toBeVisible()
  })

  it('shows the cooked weight and the rolled-up per-100g from the recipe', async () => {
    registerEndpoint('/api/recipes/4', () => composition)
    await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie },
    })

    expect(await screen.findByText('1,400 g')).toBeVisible()
    expect(screen.getByText('255 kcal')).toBeVisible()
    expect(screen.getByText('30 g protein')).toBeVisible()
  })

  it('surfaces a retryable error and hides the composition when the load fails', async () => {
    let calls = 0
    registerEndpoint('/api/recipes/4', (event) => {
      calls += 1
      setResponseStatus(event, 500)
      return { message: 'boom' }
    })
    await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie },
    })

    expect(await screen.findByText("Couldn't load your recipe")).toBeVisible()
    // The ingredient list is not rendered while errored.
    expect(screen.queryByText('Ingredients')).not.toBeInTheDocument()

    // Retry re-runs the fetch.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(2))
  })

  it('shows the newly opened recipe, not a still-in-flight previous one', async () => {
    // Cottage Pie's fetch hangs until released; Beef stew resolves immediately.
    let releaseCottagePie!: () => void
    registerEndpoint('/api/recipes/4', async () => {
      await new Promise<void>((resolve) => {
        releaseCottagePie = resolve
      })
      return composition
    })
    registerEndpoint('/api/recipes/5', () => stewComposition)

    const { rerender } = await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie },
    })
    // Switch to Beef stew (as foods.vue does) while Cottage Pie is still loading.
    await rerender({ recipe: beefStew })

    expect(await screen.findByText('Beef')).toBeVisible()
    expect(screen.queryByText('Mince')).not.toBeInTheDocument()

    // Cottage Pie's late response must not clobber the recipe now on screen.
    releaseCottagePie()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByText('Beef')).toBeVisible()
    expect(screen.queryByText('Mince')).not.toBeInTheDocument()
  })

  it('surfaces an error instead of an empty composition when the recipe is gone', async () => {
    // A recipe deleted between catalog load and view: GET /api/recipes/{id} 404s.
    registerEndpoint('/api/recipes/4', (event) => {
      setResponseStatus(event, 404)
      return { message: 'gone' }
    })
    await renderSuspended(RecipeCompositionSheet, {
      props: { recipe: cottagePie },
    })

    expect(await screen.findByText("Couldn't load your recipe")).toBeVisible()
    expect(screen.queryByText('Ingredients')).not.toBeInTheDocument()
  })
})
