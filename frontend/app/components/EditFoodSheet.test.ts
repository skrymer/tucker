import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { besideCatalog, catalogOnceReread, tagsOn } from '~~/test/catalog-host'
import { foodCatalog } from '~~/test/mocks/handlers/catalog'
import { failingRead, held, http, noConnection } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { food, recipe } from '~~/test/food-fixtures'
import EditFoodSheet from './EditFoodSheet.vue'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  remove: vi.fn(),
}))

/** Oats with protein mistyped as 31: 4 × 31 + 4 × 60 + 9 × 7 = 427 kcal. */
const oats = food({
  id: 1,
  name: 'rolled oast',
  caloriesPer100g: 427,
  proteinPer100g: 31,
  carbsPer100g: 60,
  fatPer100g: 7,
  tags: [{ id: 7, name: 'Breakfast' }],
})

describe('EditFoodSheet', () => {
  it('opens on the Food, its name and macros ready to correct', async () => {
    server.use(...foodCatalog({ foods: [oats] }))

    await renderSuspended(EditFoodSheet, { props: { food: oats } })

    expect(
      screen.getByRole('dialog', { name: 'Edit Rolled oast' }),
    ).toBeVisible()
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue(
      'rolled oast',
    )
    expect(screen.getByRole('spinbutton', { name: /^Protein/ })).toHaveValue(
      '31',
    )
    expect(screen.getByRole('spinbutton', { name: /^Carbs/ })).toHaveValue('60')
    expect(screen.getByRole('spinbutton', { name: /^Fat/ })).toHaveValue('7')
    expect(await screen.findByText('Breakfast')).toBeVisible()
  })

  it('saves the correction, closing itself once the corrected Food is in the catalog', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    const onClose = vi.fn()
    await renderSuspended(besideCatalog(EditFoodSheet), {
      props: { food: oats, onClose },
    })
    const user = userEvent.setup()

    const name = screen.getByRole('textbox', { name: /^Name/ })
    await user.clear(name)
    await user.type(name, 'Rolled oats')
    const protein = screen.getByRole('spinbutton', { name: /^Protein/ })
    await user.clear(protein)
    await user.type(protein, '13')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    const shown = await catalogOnceReread()
    // 4 × 13 + 4 × 60 + 9 × 7 = 355 kcal, derived by the server.
    expect(
      shown.getByText('Rolled oats').parentElement?.nextElementSibling,
    ).toHaveTextContent('355 kcal · 13 g protein /100g')
    expect(tagsOn(shown, 'Rolled oats')).toEqual(['Breakfast'])
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('opens on the next Food it is handed, with none of the last one’s edits', async () => {
    const skyr = food({
      id: 2,
      name: 'Skyr',
      // 4 × 11 + 4 × 4 + 9 × 0.2
      caloriesPer100g: 61.8,
      proteinPer100g: 11,
      carbsPer100g: 4,
      fatPer100g: 0.2,
    })
    server.use(...foodCatalog({ foods: [oats, skyr] }))
    const { rerender } = await renderSuspended(EditFoodSheet, {
      props: { food: null },
    })

    await rerender({ food: oats })
    const user = userEvent.setup()
    await user.type(screen.getByRole('spinbutton', { name: /^Protein/ }), '9')
    await rerender({ food: null })
    await rerender({ food: skyr })

    expect(screen.getByRole('dialog', { name: 'Edit Skyr' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('Skyr')
    expect(screen.getByRole('spinbutton', { name: /^Protein/ })).toHaveValue(
      '11',
    )
    expect(screen.getByRole('spinbutton', { name: /^Fat/ })).toHaveValue('0.2')
    expect(screen.getByRole('status')).toHaveTextContent(
      /^62 kcal · 11 g protein \/100g$/,
    )
  })

  it('restates the Food’s figures as each macro is typed, before the field is left', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    await renderSuspended(EditFoodSheet, { props: { food: oats } })
    const user = userEvent.setup()
    const figures = screen.getByRole('status')
    expect(figures).toHaveTextContent(/^427 kcal · 31 g protein \/100g$/)

    const protein = screen.getByRole('spinbutton', { name: /^Protein/ })
    await user.clear(protein)
    await user.type(protein, '13')

    // Still in the field: a number field commits only on blur.
    expect(protein).toHaveFocus()
    expect(figures).toHaveTextContent(
      /^was 427 355 kcal · was 31 13 g protein \/100g$/,
    )
  })

  it('closes without saving when dismissed', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    const onClose = vi.fn()
    await renderSuspended(EditFoodSheet, { props: { food: oats, onClose } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /close/i }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('holds Save while a Tag typed into the sheet is still being created, so the correction carries it', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    const creating = held('post', '/api/tags')
    server.use(creating.handler)
    const onClose = vi.fn()
    await renderSuspended(besideCatalog(EditFoodSheet), {
      props: { food: oats, onClose },
    })
    const user = userEvent.setup()

    const picker = screen.getByRole('combobox', { name: 'Tags' })
    await user.type(picker, 'snack')
    await user.click(await screen.findByRole('option', { name: /snack/ }))
    await creating.arrived
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()

    creating.release()
    await vi.waitFor(() => expect(save).toBeEnabled())
    await user.click(save)

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(tagsOn(await catalogOnceReread(), 'Rolled oast')).toEqual([
      'Breakfast',
      'snack',
    ])
  })

  it('opens a Food stored without a carbs figure on no figures, as its empty field shows', async () => {
    // Stored before calories were derived from all three macros: 4 × 20 + 9 × 10.
    const legacy = food({
      id: 3,
      name: 'Mince',
      caloriesPer100g: 170,
      proteinPer100g: 20,
      carbsPer100g: null,
      fatPer100g: 10,
    })
    server.use(...foodCatalog({ foods: [legacy] }))

    await renderSuspended(EditFoodSheet, { props: { food: legacy } })

    expect(screen.getByRole('spinbutton', { name: /^Carbs/ })).toHaveValue('')
    expect(screen.getByRole('status')).toHaveTextContent(/^— kcal \/100g$/)
    expect(
      screen.queryByText(
        "Food you've already logged keeps the figures it was logged with.",
      ),
    ).not.toBeInTheDocument()
  })

  it('opens the next Food with its Tags field empty, not holding a name typed for the last one', async () => {
    const skyr = food({ id: 2, name: 'Skyr' })
    server.use(...foodCatalog({ foods: [oats, skyr] }))
    const { rerender } = await renderSuspended(EditFoodSheet, {
      props: { food: oats },
    })

    await userEvent
      .setup()
      .type(screen.getByRole('combobox', { name: 'Tags' }), 'supp')
    await rerender({ food: null })
    await rerender({ food: skyr })

    expect(screen.getByRole('combobox', { name: 'Tags' })).toHaveValue('')
  })

  it('reads a figure typed with a thousands separator as the number it groups', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    await renderSuspended(EditFoodSheet, { props: { food: oats } })
    const user = userEvent.setup()

    const fat = screen.getByRole('spinbutton', { name: /^Fat/ })
    await user.clear(fat)
    await user.type(fat, '1,000')

    // 4 × 31 + 4 × 60 + 9 × 1000
    expect(screen.getByRole('status')).toHaveTextContent(
      /^was 427 9364 kcal · 31 g protein \/100g$/,
    )
  })

  it('states no figures while a macro field is empty, rather than counting it as zero', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    await renderSuspended(EditFoodSheet, { props: { food: oats } })

    await userEvent
      .setup()
      .clear(screen.getByRole('spinbutton', { name: /^Protein/ }))

    expect(screen.getByRole('status')).toHaveTextContent(/^— kcal \/100g$/)
  })

  it('restates the Food’s figures when a macro is stepped with its buttons', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    await renderSuspended(EditFoodSheet, { props: { food: oats } })

    const fat = screen.getByRole('spinbutton', { name: /^Fat/ })
    await userEvent
      .setup()
      .click(
        within(fat.parentElement!).getByRole('button', { name: 'Increment' }),
      )

    // 4 × 31 + 4 × 60 + 9 × 7.1 = 427.9
    expect(fat).toHaveValue('7.1')
    expect(screen.getByRole('status')).toHaveTextContent(
      /^was 427 428 kcal · 31 g protein \/100g$/,
    )
  })

  it('states no figures while a macro field holds only spaces', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    await renderSuspended(EditFoodSheet, { props: { food: oats } })
    const user = userEvent.setup()
    const protein = screen.getByRole('spinbutton', { name: /^Protein/ })
    await user.clear(protein)
    await user.type(protein, ' ')

    expect(protein).toHaveValue(' ')
    expect(screen.getByRole('status')).toHaveTextContent(/^— kcal \/100g$/)
  })

  it('says nothing about logged food while a cleared macro has no figure yet', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    await renderSuspended(EditFoodSheet, { props: { food: oats } })

    await userEvent
      .setup()
      .clear(screen.getByRole('spinbutton', { name: /^Protein/ }))

    expect(
      screen.queryByText(
        "Food you've already logged keeps the figures it was logged with.",
      ),
    ).not.toBeInTheDocument()
  })

  it('says logged food keeps its figures only once a macro has moved, not for a rename', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    await renderSuspended(EditFoodSheet, { props: { food: oats } })
    const user = userEvent.setup()
    const note =
      "Food you've already logged keeps the figures it was logged with."

    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 's')
    expect(screen.queryByText(note)).not.toBeInTheDocument()

    await user.type(screen.getByRole('spinbutton', { name: /^Fat/ }), '.5')
    expect(screen.getByText(note)).toBeVisible()
  })

  it('refuses to save a Food emptied of its name, as adding one would', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    const onClose = vi.fn()
    await renderSuspended(EditFoodSheet, { props: { food: oats, onClose } })
    const user = userEvent.setup()

    await user.clear(screen.getByRole('textbox', { name: /^Name/ }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Enter a name for this food')).toBeVisible()
    expect(
      screen.queryByText('Enter protein per 100 g'),
    ).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open under a persistent error when a save fails, and its Retry saves the correction', async () => {
    toastAdd.mockClear()
    server.use(...foodCatalog({ foods: [oats] }))
    server.use(
      http.put(
        '/api/foods/{id}',
        ({ response }) => response(503).json(noConnection),
        { once: true },
      ),
    )
    const onClose = vi.fn()
    await renderSuspended(besideCatalog(EditFoodSheet), {
      props: { food: oats, onClose },
    })
    const user = userEvent.setup()

    const protein = screen.getByRole('spinbutton', { name: /^Protein/ })
    await user.clear(protein)
    await user.type(protein, '13')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Could not save changes',
          duration: Infinity,
        }),
      ),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', { name: 'Edit Rolled oast' }),
    ).toBeVisible()

    toastAdd.mock.calls.at(-1)![0].actions[0].onClick()

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(
      (await catalogOnceReread()).getByText('Rolled oast').parentElement
        ?.nextElementSibling,
    ).toHaveTextContent('355 kcal · 13 g protein /100g')
  })
})

describe('EditFoodSheet’s Recipes', () => {
  // 427 × 50 / 250 = 85.4 kcal and 31 × 50 / 250 = 6.2 g protein /100g.
  const porridge = recipe({
    id: 3,
    name: 'Porridge',
    caloriesPer100g: 85.4,
    proteinPer100g: 6.2,
    cookedWeightG: 250,
    ingredientCount: 1,
  })
  // 427 × 300 / 400 = 320.25 kcal and 31 × 300 / 400 = 23.25 g protein /100g.
  const granolaBars = recipe({
    id: 4,
    name: 'Granola bars',
    caloriesPer100g: 320.25,
    proteinPer100g: 23.25,
    cookedWeightG: 400,
    ingredientCount: 1,
  })
  const usedTwice = () =>
    foodCatalog({
      foods: [oats, porridge, granolaBars],
      compositions: {
        3: [{ foodId: 1, grams: 50 }],
        4: [{ foodId: 1, grams: 300 }],
      },
    })

  it('says how many Recipes use the Food, its list collapsed', async () => {
    server.use(...usedTwice())

    await renderSuspended(EditFoodSheet, { props: { food: oats } })

    const toggle = await screen.findByRole('button', {
      name: 'Used in 2 recipes',
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Porridge')).not.toBeInTheDocument()
    expect(screen.queryByText('Granola bars')).not.toBeInTheDocument()
  })

  it('says nothing of Recipes when none uses the Food', async () => {
    const read = held('get', '/api/foods/{id}/recipes')
    server.use(
      read.handler,
      ...foodCatalog({ foods: [oats, porridge, granolaBars] }),
    )
    await renderSuspended(EditFoodSheet, { props: { food: oats } })

    await read.arrived
    read.release()
    // Absence has nothing to wait for: give the answer time to land first.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(screen.queryByText(/recipe/)).not.toBeInTheDocument()
  })

  it('lists each Recipe by name over its figures once expanded', async () => {
    server.use(...usedTwice())
    await renderSuspended(EditFoodSheet, { props: { food: oats } })
    const toggle = await screen.findByRole('button', {
      name: 'Used in 2 recipes',
    })

    await userEvent.setup().click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent(
      /^Granola bars\s*320 kcal · 23 g protein \/100g$/,
    )
    expect(rows[1]).toHaveTextContent(
      /^Porridge\s*85 kcal · 6 g protein \/100g$/,
    )
  })

  it('says the Recipes are also updated once a macro moves, before the field is left', async () => {
    server.use(...usedTwice())
    await renderSuspended(EditFoodSheet, { props: { food: oats } })
    await screen.findByRole('button', { name: 'Used in 2 recipes' })
    const user = userEvent.setup()

    const protein = screen.getByRole('spinbutton', { name: /^Protein/ })
    await user.clear(protein)
    await user.type(protein, '13')

    expect(protein).toHaveFocus()
    expect(
      screen.getByRole('button', { name: 'Also updates 2 recipes' }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('button', { name: 'Used in 2 recipes' }),
    ).not.toBeInTheDocument()
  })

  it('restates each Recipe’s figures before → after as a macro is typed, before the field is left', async () => {
    server.use(...usedTwice())
    await renderSuspended(EditFoodSheet, { props: { food: oats } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Used in 2 recipes' }),
    )

    const protein = screen.getByRole('spinbutton', { name: /^Protein/ })
    await user.clear(protein)
    await user.type(protein, '13')

    // Oats corrected: 4 × 13 + 4 × 60 + 9 × 7 = 355 kcal /100g. Granola bars:
    // 355 × 300 / 400 = 266.25 kcal, 13 × 300 / 400 = 9.75 g protein. Porridge:
    // 355 × 50 / 250 = 71 kcal, 13 × 50 / 250 = 2.6 g protein.
    expect(protein).toHaveFocus()
    const [granolaBars, porridge] = screen.getAllByRole('listitem')
    expect(granolaBars).toHaveTextContent(
      /^Granola bars\s*was 320 266 kcal · was 23 10 g protein \/100g$/,
    )
    expect(porridge).toHaveTextContent(
      /^Porridge\s*was 85 71 kcal · was 6 3 g protein \/100g$/,
    )
  })

  it('says it could not read which Recipes use the Food, and its Retry reads them', async () => {
    let down = true
    server.use(
      failingRead('/api/foods/{id}/recipes', () => down),
      ...usedTwice(),
    )
    await renderSuspended(EditFoodSheet, { props: { food: oats } })

    expect(
      await screen.findByText("Couldn't check which recipes use it"),
    ).toBeVisible()

    down = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('button', { name: 'Used in 2 recipes' }),
    ).toBeVisible()
    expect(
      screen.queryByText("Couldn't check which recipes use it"),
    ).not.toBeInTheDocument()
  })
})
