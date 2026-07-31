import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { components } from '#open-fetch-schemas/api'
import RecipeBuilder from './RecipeBuilder.vue'

// The catalog shape the component actually receives, rather than a hand-rolled
// copy that can drift from it.
type Food = components['schemas']['FoodResponse']

function food(partial: Partial<Food> & { id: number; name: string }): Food {
  return {
    kind: 'FOOD',
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 0,
    fatPer100g: 0,
    ...partial,
  }
}

const beefMince = food({
  id: 1,
  name: 'Beef mince',
  caloriesPer100g: 170,
  proteinPer100g: 20,
})
const potato = food({
  id: 2,
  name: 'Potato',
  caloriesPer100g: 77,
  proteinPer100g: 2,
})
const sampleFoods: Food[] = [beefMince, potato]

describe('RecipeBuilder', () => {
  it('opens on the build step with a recipe name field and a way to add ingredients', async () => {
    await renderSuspended(RecipeBuilder, { props: { foods: sampleFoods } })

    expect(screen.getByLabelText(/recipe name/i)).toBeVisible()
    expect(
      screen.getByRole('button', { name: /add ingredient/i }),
    ).toBeVisible()
  })

  it('adds an ingredient through pick then grams and lists it with its calorie contribution', async () => {
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, { props: { foods: sampleFoods } })

    await user.click(screen.getByRole('button', { name: /add ingredient/i }))
    // Pick step: choose the Food to weigh in.
    await user.click(screen.getByRole('button', { name: /beef mince/i }))
    // Grams step: weigh it, then add it to the recipe.
    await user.type(screen.getByLabelText(/grams/i), '300')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    // Back on build: the ingredient is a row showing its grams and kcal.
    // Beef mince is 170 kcal /100g → 300 g contributes 510 kcal.
    const row = screen.getByRole('button', { name: /beef mince/i })
    expect(row).toHaveTextContent('300 g')
    expect(row).toHaveTextContent('510 kcal')
  })

  /** Pick a Food, weigh it in, and return to the build step. */
  async function addIngredient(
    user: ReturnType<typeof userEvent.setup>,
    name: RegExp,
    grams: string,
  ) {
    await user.click(screen.getByRole('button', { name: /add ingredient/i }))
    await user.click(screen.getByRole('button', { name }))
    await user.type(screen.getByLabelText(/grams/i), grams)
    await user.click(screen.getByRole('button', { name: /^add$/i }))
  }

  /** The default first ingredient: Beef mince, 300 g. */
  async function addBeefMince(user: ReturnType<typeof userEvent.setup>) {
    await addIngredient(user, /beef mince/i, '300')
  }

  it('shows a live Per 100 g result that follows the ingredients and cooked weight', async () => {
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, { props: { foods: sampleFoods } })

    await addBeefMince(user)

    // Cooked weight defaults to the 300 g raw sum: 510 kcal / 300 g × 100 = 170,
    // 60 g protein / 300 g × 100 = 20 g.
    const result = screen.getByRole('region', { name: /per 100 g/i })
    expect(within(result).getByText(/170 kcal/i)).toBeVisible()
    expect(within(result).getByText(/20 g protein/i)).toBeVisible()

    // Cooking it down to 200 g concentrates it: 510 / 200 × 100 = 255 kcal,
    // 60 / 200 × 100 = 30 g protein.
    const cooked = screen.getByLabelText(/cooked weight/i)
    await user.clear(cooked)
    await user.type(cooked, '200')
    await user.tab()

    await vi.waitFor(() => {
      expect(within(result).getByText(/255 kcal/i)).toBeVisible()
      expect(within(result).getByText(/30 g protein/i)).toBeVisible()
    })
  })

  it('defaults the cooked weight to the raw ingredient total until it is edited', async () => {
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, { props: { foods: sampleFoods } })

    await addBeefMince(user)
    expect(screen.getByLabelText(/cooked weight/i)).toHaveDisplayValue('300')

    // A second ingredient keeps the field tracking the raw total (300 + 100).
    await addIngredient(user, /potato/i, '100')
    expect(screen.getByLabelText(/cooked weight/i)).toHaveDisplayValue('400')

    // Once the user sets it, it stops tracking and holds their value.
    const cooked = screen.getByLabelText(/cooked weight/i)
    await user.clear(cooked)
    await user.type(cooked, '350')
    await user.tab()
    await vi.waitFor(() =>
      expect(screen.getByLabelText(/cooked weight/i)).toHaveDisplayValue('350'),
    )
  })

  it('keeps the cooked weight an estimate when the user only tabs past it', async () => {
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, { props: { foods: sampleFoods } })

    // 305 deliberately sits off the field's 10 g step, so a blur that re-snaps
    // the value and a blur that merely re-emits it both show up here.
    await addIngredient(user, /beef mince/i, '305')
    expect(screen.getByLabelText(/cooked weight/i)).toHaveDisplayValue('305')
    expect(screen.getByText(/estimated/i)).toBeVisible()

    // Passing through the field on the way to Save is not weighing the dish.
    await user.click(screen.getByLabelText(/cooked weight/i))
    await user.tab()

    expect(screen.getByLabelText(/cooked weight/i)).toHaveDisplayValue('305')
    expect(screen.getByText(/estimated/i)).toBeVisible()

    // Still an estimate, so a further ingredient still moves it (305 + 100).
    // Were it stuck at 305, the rollup would divide a 405 g dish's calories by
    // 305 and overstate its per-100 g nutrition by a third.
    await addIngredient(user, /potato/i, '100')

    expect(screen.getByLabelText(/cooked weight/i)).toHaveDisplayValue('405')
  })

  it('keeps the cooked weight an estimate when the ingredients sum inexactly', async () => {
    // 100.1 + 200.2 is 300.29999999999995 in binary floating point, and the
    // field can only show three decimals — so the figure it hands back on a
    // blur is not bit-identical to the one it was seeded with. That difference
    // is invisible to the user and must not read as them weighing the dish.
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, { props: { foods: sampleFoods } })

    await addIngredient(user, /beef mince/i, '100.1')
    await addIngredient(user, /potato/i, '200.2')
    expect(screen.getByLabelText(/cooked weight/i)).toHaveDisplayValue('300.3')
    expect(screen.getByText(/estimated/i)).toBeVisible()

    await user.click(screen.getByLabelText(/cooked weight/i))
    await user.tab()

    expect(screen.getByText(/estimated/i)).toBeVisible()

    // Still tracking: reweighing an ingredient moves it (200.1 + 200.2).
    await user.click(screen.getByRole('button', { name: /beef mince/i }))
    await user.clear(screen.getByLabelText(/grams/i))
    await user.type(screen.getByLabelText(/grams/i), '200.1')
    await user.click(screen.getByRole('button', { name: /update/i }))

    expect(screen.getByLabelText(/cooked weight/i)).toHaveDisplayValue('400.3')
  })

  it('counts weighing the dish as an edit even when it matches the raw total', async () => {
    // A dish that loses no water — overnight oats, a shake — weighs what went
    // into it. The user still weighed it, so the figure stops being an estimate
    // and must stop tracking; otherwise the next ingredient overwrites the one
    // number they actually measured.
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, { props: { foods: sampleFoods } })

    await addBeefMince(user)
    expect(screen.getByText(/estimated/i)).toBeVisible()

    const cooked = screen.getByLabelText(/cooked weight/i)
    await user.clear(cooked)
    await user.type(cooked, '300')
    await user.tab()

    expect(screen.queryByText(/estimated/i)).not.toBeInTheDocument()

    await addIngredient(user, /potato/i, '100')

    expect(screen.getByLabelText(/cooked weight/i)).toHaveDisplayValue('300')
  })

  it('records the cooked weight the scales showed, not one rounded to the step', async () => {
    // The step sizes the arrows for a coarse first guess; the field still has
    // to hold the real scale weight the help text asks for, because that number
    // is what re-expresses the conserved total per 100 g (ADR 0019).
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, {
      props: { foods: sampleFoods, onSubmit },
    })

    await addBeefMince(user)
    await user.type(screen.getByLabelText(/recipe name/i), 'Cottage pie')
    const cooked = screen.getByLabelText(/cooked weight/i)
    await user.clear(cooked)
    await user.type(cooked, '1234')
    await user.tab()

    await user.click(screen.getByRole('button', { name: /save recipe/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Cottage pie',
      cookedWeightG: 1234,
      ingredients: [{ foodId: 1, grams: 300 }],
    })
  })

  it('edits an ingredient row, reweighing it in place', async () => {
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, { props: { foods: sampleFoods } })

    await addBeefMince(user)

    // Tapping the row reopens the grams step prefilled with its current weight.
    await user.click(screen.getByRole('button', { name: /beef mince/i }))
    expect(screen.getByLabelText(/grams/i)).toHaveDisplayValue('300')

    await user.clear(screen.getByLabelText(/grams/i))
    await user.type(screen.getByLabelText(/grams/i), '200')
    await user.click(screen.getByRole('button', { name: /update/i }))

    // The row now reflects 200 g → 170 × 2 = 340 kcal.
    const row = screen.getByRole('button', { name: /beef mince/i })
    expect(row).toHaveTextContent('200 g')
    expect(row).toHaveTextContent('340 kcal')
  })

  it('removes an ingredient row', async () => {
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, { props: { foods: sampleFoods } })

    await addBeefMince(user)
    await user.click(screen.getByRole('button', { name: /beef mince/i }))
    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(
      screen.queryByRole('button', { name: /beef mince/i }),
    ).not.toBeInTheDocument()
  })

  it('emits the recipe payload — name, cooked weight, and ingredient lines — on save', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, {
      props: { foods: sampleFoods, onSubmit },
    })

    await addBeefMince(user)
    await user.type(screen.getByLabelText(/recipe name/i), 'Cottage pie')
    const cooked = screen.getByLabelText(/cooked weight/i)
    await user.clear(cooked)
    await user.type(cooked, '200')
    await user.tab()

    await user.click(screen.getByRole('button', { name: /save recipe/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Cottage pie',
      cookedWeightG: 200,
      ingredients: [{ foodId: 1, grams: 300 }],
    })
  })

  it('cannot save a recipe with no ingredients', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, {
      props: { foods: sampleFoods, onSubmit },
    })

    await user.type(screen.getByLabelText(/recipe name/i), 'Empty dish')
    await user.click(screen.getByRole('button', { name: /save recipe/i }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/add at least one ingredient/i)).toBeVisible()
  })

  it('excludes recipes from the ingredient picker — only plain foods can be ingredients', async () => {
    const user = userEvent.setup()
    const withRecipe = [
      ...sampleFoods,
      food({
        id: 3,
        name: 'Existing stew',
        kind: 'RECIPE',
        cookedWeightG: 500,
      }),
    ]
    await renderSuspended(RecipeBuilder, { props: { foods: withRecipe } })

    await user.click(screen.getByRole('button', { name: /add ingredient/i }))

    expect(screen.getByRole('button', { name: /beef mince/i })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /existing stew/i }),
    ).not.toBeInTheDocument()
  })

  it('pre-fills the builder from an existing recipe, showing the recorded cooked weight as final', async () => {
    await renderSuspended(RecipeBuilder, {
      props: {
        foods: sampleFoods,
        initial: {
          name: 'Cottage pie',
          cookedWeightG: 200,
          ingredients: [{ food: beefMince, grams: 300 }],
        },
      },
    })

    expect(screen.getByLabelText(/recipe name/i)).toHaveDisplayValue(
      'Cottage pie',
    )
    // The ingredient line is pre-populated with its grams and kcal contribution.
    const row = screen.getByRole('button', { name: /beef mince/i })
    expect(row).toHaveTextContent('300 g')
    expect(row).toHaveTextContent('510 kcal')
    // The recorded cooked weight (200) stands — it is not overwritten by the raw
    // 300 g sum, and it is not tagged as an estimate.
    expect(screen.getByLabelText(/cooked weight/i)).toHaveDisplayValue('200')
    expect(screen.queryByText(/estimated/i)).not.toBeInTheDocument()
  })

  it('saves changes to an existing recipe, emitting the edited payload', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    await renderSuspended(RecipeBuilder, {
      props: {
        foods: sampleFoods,
        initial: {
          name: 'Cottage pie',
          cookedWeightG: 200,
          ingredients: [{ food: beefMince, grams: 300 }],
        },
        onSubmit,
      },
    })

    // Editing keeps the same builder; its save reads as "Save changes".
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Cottage pie',
      cookedWeightG: 200,
      ingredients: [{ foodId: 1, grams: 300 }],
    })
  })

  it('hands a brand-new food up to the parent, then continues once it is selected', async () => {
    const onCreateFood = vi.fn()
    const user = userEvent.setup()
    const { rerender } = await renderSuspended(RecipeBuilder, {
      // Keyed to the emit name (`create-food`), not its camelCase form.
      props: { foods: sampleFoods, 'onCreate-food': onCreateFood },
    })

    await user.click(screen.getByRole('button', { name: /add ingredient/i }))
    await user.click(screen.getByRole('button', { name: /add a new food/i }))

    // The inline Add-Food form hands the create up to the page (which owns the
    // catalog and its mutations) rather than POSTing from the builder.
    await user.type(screen.getByLabelText(/^name$/i), 'Carrot')
    await user.type(screen.getByLabelText(/protein \/100\s*g/i), '0.9')
    await user.type(screen.getByLabelText(/carbs \/100\s*g/i), '10')
    await user.type(screen.getByLabelText(/fat \/100\s*g/i), '0.2')
    await user.click(screen.getByRole('button', { name: /save food/i }))

    expect(onCreateFood).toHaveBeenCalledWith({
      name: 'Carrot',
      proteinPer100g: 0.9,
      carbsPer100g: 10,
      fatPer100g: 0.2,
    })

    // The parent persists it and hands it back; the builder selects it and
    // continues to the grams step.
    const carrot = food({ id: 99, name: 'Carrot', caloriesPer100g: 41 })
    await rerender({
      foods: [...sampleFoods, carrot],
      createdIngredient: carrot,
      onCreateFood,
    })

    expect(await screen.findByText('Carrot')).toBeVisible()
    await user.type(screen.getByLabelText(/grams/i), '100')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    // The new Food is now an ingredient row (41 kcal /100g → 100 g = 41 kcal).
    const row = screen.getByRole('button', { name: /carrot/i })
    expect(row).toHaveTextContent('100 g')
    expect(row).toHaveTextContent('41 kcal')
  })
})
