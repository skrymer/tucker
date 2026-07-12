import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import RecipeBuilder from './RecipeBuilder.vue'

type Food = {
  id: number
  name: string
  kind: string
  caloriesPer100g: number
  proteinPer100g: number
  carbsPer100g: number | null
  fatPer100g: number | null
  cookedWeightG: number | null
}

function food(partial: Partial<Food> & { id: number; name: string }): Food {
  return {
    kind: 'FOOD',
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 0,
    fatPer100g: 0,
    cookedWeightG: null,
    ...partial,
  }
}

const sampleFoods: Food[] = [
  food({ id: 1, name: 'Beef mince', caloriesPer100g: 170, proteinPer100g: 20 }),
  food({ id: 2, name: 'Potato', caloriesPer100g: 77, proteinPer100g: 2 }),
]

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

  /** Add one ingredient (Beef mince, 300 g) and return to the build step. */
  async function addBeefMince(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /add ingredient/i }))
    await user.click(screen.getByRole('button', { name: /beef mince/i }))
    await user.type(screen.getByLabelText(/grams/i), '300')
    await user.click(screen.getByRole('button', { name: /^add$/i }))
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
    await user.click(screen.getByRole('button', { name: /add ingredient/i }))
    await user.click(screen.getByRole('button', { name: /potato/i }))
    await user.type(screen.getByLabelText(/grams/i), '100')
    await user.click(screen.getByRole('button', { name: /^add$/i }))
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
          ingredients: [{ food: sampleFoods[0], grams: 300 }],
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
          ingredients: [{ food: sampleFoods[0], grams: 300 }],
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
      props: { foods: sampleFoods, onCreateFood },
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
