import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { besideCatalog, catalogOnceReread, tagsOn } from '~~/test/catalog-host'
import { foodCatalog } from '~~/test/mocks/handlers/catalog'
import { referenceFoodsFor } from '~~/test/mocks/handlers/reference-foods'
import {
  referenceFoodCandidate,
  referenceFoodSearch,
} from '~~/test/micronutrient-fixtures'
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

/** The protein wrap off its label: 4 × 19.4 + 4 × 12.8 + 9 × 9.3 + 2 × 16.8 = 246.1 kcal. */
const wrap = food({
  id: 2,
  name: 'Protein wrap',
  caloriesPer100g: 246.1,
  proteinPer100g: 19.4,
  carbsPer100g: 12.8,
  fatPer100g: 9.3,
  fibrePer100g: 16.8,
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

  it('opens on the fibre the Food states, and on a blank field where it states none', async () => {
    server.use(...foodCatalog({ foods: [wrap, oats] }))
    const { rerender } = await renderSuspended(EditFoodSheet, {
      props: { food: wrap },
    })

    expect(screen.getByRole('spinbutton', { name: /^Fibre/ })).toHaveValue(
      '16.8',
    )

    await rerender({ food: oats })

    expect(screen.getByRole('spinbutton', { name: /^Fibre/ })).toHaveValue('')
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

  it('saves the fibre the correction states, the catalog reading the calories it adds', async () => {
    server.use(...foodCatalog({ foods: [oats] }))
    const onClose = vi.fn()
    await renderSuspended(besideCatalog(EditFoodSheet), {
      props: { food: oats, onClose },
    })
    const user = userEvent.setup()

    await user.type(screen.getByRole('spinbutton', { name: /^Fibre/ }), '10')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    const shown = await catalogOnceReread()
    // 427 + 2 × 10 = 447 kcal, derived by the server.
    expect(
      shown.getByText('Rolled oast').parentElement?.nextElementSibling,
    ).toHaveTextContent('447 kcal · 31 g protein /100g')
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

  it('counts the fibre as it is typed, at 2 kcal a gram, before the field is left', async () => {
    // The wrap typed without its fibre: 4 × 19.4 + 4 × 12.8 + 9 × 9.3 = 212.5 kcal.
    const unstated = { ...wrap, caloriesPer100g: 212.5, fibrePer100g: null }
    server.use(...foodCatalog({ foods: [unstated] }))
    await renderSuspended(EditFoodSheet, { props: { food: unstated } })
    const user = userEvent.setup()
    const figures = screen.getByRole('status')

    const fibre = screen.getByRole('spinbutton', { name: /^Fibre/ })
    await user.type(fibre, '16.8')

    expect(fibre).toHaveFocus()
    expect(figures).toHaveTextContent(
      /^was 213 246 kcal · 19 g protein \/100g$/,
    )
  })

  it('opens a Food that states fibre on its own figures, its fibre counted', async () => {
    server.use(...foodCatalog({ foods: [wrap] }))
    await renderSuspended(EditFoodSheet, { props: { food: wrap } })

    expect(screen.getByRole('status')).toHaveTextContent(
      /^246 kcal · 19 g protein \/100g$/,
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

  it('names no Recipe count before the read has answered', async () => {
    const read = held('get', '/api/foods/{id}/recipes')
    server.use(read.handler, ...usedTwice())
    await renderSuspended(EditFoodSheet, { props: { food: oats } })

    await read.arrived

    expect(screen.queryByText(/recipe/)).not.toBeInTheDocument()
    read.release()
    expect(
      await screen.findByRole('button', { name: 'Used in 2 recipes' }),
    ).toBeVisible()
  })

  it('holds Save until it knows which Recipes the correction reaches', async () => {
    const read = held('get', '/api/foods/{id}/recipes')
    server.use(read.handler, ...usedTwice())
    await renderSuspended(EditFoodSheet, { props: { food: oats } })
    const save = screen.getByRole('button', { name: 'Save changes' })

    await read.arrived

    expect(save).toBeDisabled()
    read.release()
    await screen.findByRole('button', { name: 'Used in 2 recipes' })
    expect(save).toBeEnabled()
  })

  it('lets Save go ahead when it could not read which Recipes use the Food', async () => {
    server.use(failingRead('/api/foods/{id}/recipes'), ...usedTwice())
    await renderSuspended(EditFoodSheet, { props: { food: oats } })

    expect(
      await screen.findByText("Couldn't check which recipes use it"),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('says it is checking which Recipes use the Food once the read takes over 150 ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const read = held('get', '/api/foods/{id}/recipes')
      server.use(read.handler, ...usedTwice())
      await renderSuspended(EditFoodSheet, { props: { food: oats } })
      await read.arrived

      await vi.advanceTimersByTimeAsync(150)

      expect(
        await screen.findByRole('status', { name: 'Checking recipes' }),
      ).toBeVisible()
      read.release()
      await screen.findByRole('button', { name: 'Used in 2 recipes' })
      await vi.advanceTimersByTimeAsync(400)
      expect(
        screen.queryByRole('status', { name: 'Checking recipes' }),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('puts the Recipes in place of its checking state the moment they arrive', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const read = held('get', '/api/foods/{id}/recipes')
      server.use(read.handler, ...usedTwice())
      await renderSuspended(EditFoodSheet, { props: { food: oats } })
      await read.arrived
      await vi.advanceTimersByTimeAsync(150)
      await screen.findByRole('status', { name: 'Checking recipes' })

      read.release()
      await vi.waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Save changes' }),
        ).toBeEnabled(),
      )

      expect(
        screen.getByRole('button', { name: 'Used in 2 recipes' }),
      ).toBeVisible()
      expect(
        screen.queryByRole('status', { name: 'Checking recipes' }),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives a slow Recipe read its whole 8 s before giving up on it', async () => {
    // Only the timers are faked, and nothing advances them but the test, so no
    // wall-clock time spent rendering reaches the 8 s clock.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const read = held('get', '/api/foods/{id}/recipes')
    try {
      server.use(read.handler, ...usedTwice())
      await renderSuspended(EditFoodSheet, { props: { food: oats } })
      await read.arrived

      await vi.advanceTimersByTimeAsync(7999)

      expect(
        screen.getByRole('button', { name: 'Save changes' }),
      ).toBeDisabled()
      expect(
        screen.queryByText("Couldn't check which recipes use it"),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
      read.release()
    }
    await screen.findByRole('button', { name: 'Used in 2 recipes' })
  })

  it('gives up on a Recipe read that stalls past 8 s, saying so and letting Save go ahead', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const read = held('get', '/api/foods/{id}/recipes')
      server.use(read.handler, ...usedTwice())
      await renderSuspended(EditFoodSheet, { props: { food: oats } })
      await read.arrived
      const save = screen.getByRole('button', { name: 'Save changes' })
      expect(save).toBeDisabled()

      await vi.advanceTimersByTimeAsync(8000)

      expect(
        await screen.findByText("Couldn't check which recipes use it"),
      ).toBeVisible()
      expect(save).toBeEnabled()
      read.release()
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds Save without a spinner while it reads the Recipes, since Save started nothing', async () => {
    const read = held('get', '/api/foods/{id}/recipes')
    server.use(read.handler, ...usedTwice())
    await renderSuspended(EditFoodSheet, { props: { food: oats } })
    await read.arrived

    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    // Nuxt UI draws a loading button's spinner as a spinning icon inside it, with
    // no role or name to find it by.
    expect(save.querySelector('.animate-spin')).toBeNull()
    read.release()
    await screen.findByRole('button', { name: 'Used in 2 recipes' })
  })

  it('says nothing of Recipes when none uses the Food', async () => {
    server.use(...foodCatalog({ foods: [oats, porridge, granolaBars] }))
    await renderSuspended(EditFoodSheet, { props: { food: oats } })

    // Save is released once the Recipe read has answered.
    await vi.waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save changes' }),
      ).toBeEnabled(),
    )

    expect(screen.queryByText(/recipe/)).not.toBeInTheDocument()
  })

  it('states each Recipe at the figures it is stored with, not a roll-up of its lines', async () => {
    server.use(
      ...foodCatalog({
        // Stored at 90 kcal and 7 g protein, where its line rolls up to 85.4 and 6.2.
        foods: [oats, { ...porridge, caloriesPer100g: 90, proteinPer100g: 7 }],
        compositions: { 3: [{ foodId: 1, grams: 50 }] },
      }),
    )
    await renderSuspended(EditFoodSheet, { props: { food: oats } })

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Used in 1 recipe' }))

    expect(screen.getByRole('listitem')).toHaveTextContent(
      /^Porridge\s*90 kcal · 7 g protein \/100g$/,
    )
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

  it('restates each Recipe’s figures as the Food’s fibre is typed, before the field is left', async () => {
    server.use(...usedTwice())
    await renderSuspended(EditFoodSheet, { props: { food: oats } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Used in 2 recipes' }),
    )

    const fibre = screen.getByRole('spinbutton', { name: /^Fibre/ })
    await user.type(fibre, '10')

    // Oats with 10 g fibre: 427 + 2 × 10 = 447 kcal /100g. Granola bars:
    // 447 × 300 / 400 = 335.25 kcal. Porridge: 447 × 50 / 250 = 89.4 kcal.
    expect(fibre).toHaveFocus()
    expect(
      screen.getByRole('button', { name: 'Also updates 2 recipes' }),
    ).toBeVisible()
    const [granolaBars, porridge] = screen.getAllByRole('listitem')
    expect(granolaBars).toHaveTextContent(
      /^Granola bars\s*was 320 335 kcal · 23 g protein \/100g$/,
    )
    expect(porridge).toHaveTextContent(
      /^Porridge\s*was 85 89 kcal · 6 g protein \/100g$/,
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

describe('EditFoodSheet’s Reference Food match', () => {
  const cheese = food({
    id: 3,
    name: 'Tasty cheese',
    caloriesPer100g: 397,
    proteinPer100g: 25,
    carbsPer100g: 0,
    fatPer100g: 33,
    referenceFoodId: 9,
    referenceFoodName: 'Cheese, cheddar, natural, regular fat',
  })

  beforeEach(() => toastAdd.mockClear())

  it('names what a matched Food borrows its vitamins and minerals from, with Change and Clear', async () => {
    server.use(...foodCatalog({ foods: [cheese] }))

    await renderSuspended(EditFoodSheet, {
      props: { food: cheese, tracksCalories: true },
    })

    const sheet = screen.getByRole('dialog', { name: 'Edit Tasty cheese' })
    expect(
      within(sheet).getByText(
        'Vitamins and minerals from Cheese, cheddar, natural, regular fat',
      ),
    ).toBeVisible()
    expect(
      within(sheet).getByRole('button', {
        name: 'Change what Tasty cheese borrows vitamins and minerals from',
      }),
    ).toBeVisible()
    expect(
      within(sheet).getByRole('button', {
        name: 'Clear what Tasty cheese borrows vitamins and minerals from',
      }),
    ).toBeVisible()
  })

  it('offers an unmatched Food no way to make a match, the queue on /review being the one way in', async () => {
    server.use(...foodCatalog({ foods: [oats] }))

    await renderSuspended(EditFoodSheet, {
      props: { food: oats, tracksCalories: true },
    })

    const sheet = screen.getByRole('dialog', { name: 'Edit Rolled oast' })
    expect(
      within(sheet).queryByText(/Vitamins and minerals/),
    ).not.toBeInTheDocument()
    expect(
      within(sheet).queryByRole('button', { name: /vitamins and minerals/ }),
    ).not.toBeInTheDocument()
    expect(within(sheet).getByRole('textbox', { name: /^Name/ })).toBeVisible()
  })

  it('clears the match straight away, without waiting for Save, and stays open', async () => {
    server.use(...foodCatalog({ foods: [cheese] }))
    const onClose = vi.fn()
    await renderSuspended(besideCatalog(EditFoodSheet), {
      props: { food: cheese, tracksCalories: true, onClose },
    })
    const sheet = screen.getByRole('dialog', { name: 'Edit Tasty cheese' })

    await userEvent.setup().click(
      within(sheet).getByRole('button', {
        name: 'Clear what Tasty cheese borrows vitamins and minerals from',
      }),
    )

    const shown = await catalogOnceReread()
    expect(shown.getByText('Tasty cheese')).toBeInTheDocument()
    expect(shown.queryByText(/Vitamins and minerals/)).not.toBeInTheDocument()
    expect(sheet).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('opens the match search in the same sheet, never a second one over it', async () => {
    server.use(...foodCatalog({ foods: [cheese] }))
    await renderSuspended(EditFoodSheet, {
      props: { food: cheese, tracksCalories: true },
    })

    await userEvent.setup().click(
      screen.getByRole('button', {
        name: 'Change what Tasty cheese borrows vitamins and minerals from',
      }),
    )

    // One modal layer on a phone: the sheet's body becomes the search. Counted
    // with hidden ones, since a sheet stacked over it would hide this one.
    const sheets = screen.getAllByRole('dialog', { hidden: true })
    expect(sheets).toHaveLength(1)
    expect(sheets[0]).toHaveAccessibleName('Match Tasty cheese')
    expect(
      within(sheets[0]!).getByRole('textbox', {
        name: 'Search the food database',
      }),
    ).toHaveValue('Tasty cheese')
    expect(
      within(sheets[0]!).getByRole('button', { name: 'Back' }),
    ).toBeVisible()
    expect(
      within(sheets[0]!).queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument()
  })

  it('offers its way back in the header, before the title, as a phone sheet does', async () => {
    server.use(...foodCatalog({ foods: [cheese] }))
    await renderSuspended(EditFoodSheet, {
      props: { food: cheese, tracksCalories: true },
    })
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: 'Change what Tasty cheese borrows vitamins and minerals from',
      }),
    )

    const sheet = screen.getByRole('dialog', { name: 'Match Tasty cheese' })
    const heading = within(sheet).getByRole('heading', {
      name: 'Match Tasty cheese',
    })
    const back = within(sheet).getByRole('button', { name: 'Back' })
    expect(
      back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('reopens on the form, not on a match search it was closed in', async () => {
    server.use(...foodCatalog({ foods: [cheese] }))
    const { rerender } = await renderSuspended(EditFoodSheet, {
      props: { food: cheese, tracksCalories: true },
    })
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: 'Change what Tasty cheese borrows vitamins and minerals from',
      }),
    )
    expect(
      screen.getByRole('dialog', { name: 'Match Tasty cheese' }),
    ).toBeVisible()

    await rerender({ food: null })
    await rerender({ food: cheese })

    const sheet = screen.getByRole('dialog', { name: 'Edit Tasty cheese' })
    expect(
      within(sheet).getByRole('button', { name: 'Save changes' }),
    ).toBeVisible()
  })

  it('goes back from the match search to the form, its unsaved edits standing and nothing matched', async () => {
    server.use(...foodCatalog({ foods: [cheese] }))
    await renderSuspended(besideCatalog(EditFoodSheet), {
      props: { food: cheese, tracksCalories: true },
    })
    const user = userEvent.setup()
    const name = screen.getByRole('textbox', { name: /^Name/ })
    await user.clear(name)
    await user.type(name, 'Vintage cheese')
    await user.click(
      screen.getByRole('button', {
        name: 'Change what Tasty cheese borrows vitamins and minerals from',
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Back' }))

    const sheet = screen.getByRole('dialog', { name: 'Edit Tasty cheese' })
    expect(within(sheet).getByRole('textbox', { name: /^Name/ })).toHaveValue(
      'Vintage cheese',
    )
    expect(
      within(sheet).getByText(
        'Vitamins and minerals from Cheese, cheddar, natural, regular fat',
      ),
    ).toBeVisible()
    expect(
      within(sheet).queryByRole('textbox', {
        name: 'Search the food database',
      }),
    ).not.toBeInTheDocument()
  })

  it('changes the match through the picker straight away, keeping the sheet and its unsaved edits', async () => {
    const reduced = { id: 12, name: 'Cheese, cheddar, reduced fat' }
    server.use(
      ...foodCatalog({ foods: [cheese], referenceFoods: [reduced] }),
      referenceFoodsFor({
        'Tasty cheese': referenceFoodSearch({
          suggestedId: reduced.id,
          candidates: [referenceFoodCandidate(reduced)],
        }),
      }),
    )
    const onClose = vi.fn()
    await renderSuspended(besideCatalog(EditFoodSheet), {
      props: { food: cheese, tracksCalories: true, onClose },
    })
    const user = userEvent.setup()
    const sheet = screen.getByRole('dialog', { name: 'Edit Tasty cheese' })
    const name = within(sheet).getByRole('textbox', { name: /^Name/ })
    await user.clear(name)
    await user.type(name, 'Vintage cheese')

    await user.click(
      within(sheet).getByRole('button', {
        name: 'Change what Tasty cheese borrows vitamins and minerals from',
      }),
    )
    const picker = await screen.findByRole('dialog', {
      name: 'Match Tasty cheese',
    })
    await user.click(
      await within(picker).findByRole('button', {
        name: /Cheese, cheddar, reduced fat/,
      }),
    )

    const shown = await catalogOnceReread()
    expect(
      shown.getByText(
        'Vitamins and minerals from Cheese, cheddar, reduced fat',
      ),
    ).toBeInTheDocument()
    // Back on the form, in the same sheet, with the edits not yet saved.
    expect(
      await screen.findByRole('dialog', { name: 'Edit Tasty cheese' }),
    ).toBe(sheet)
    expect(within(sheet).getByRole('textbox', { name: /^Name/ })).toHaveValue(
      'Vintage cheese',
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says nothing about a match to a User who does not count calories', async () => {
    server.use(...foodCatalog({ foods: [cheese] }))

    await renderSuspended(EditFoodSheet, {
      props: { food: cheese, tracksCalories: false },
    })

    // Gated on the setting, never on whether the Food happens to hold a match
    // (ADR 0027), as the catalog row is.
    const sheet = screen.getByRole('dialog', { name: 'Edit Tasty cheese' })
    expect(
      within(sheet).queryByText(/Vitamins and minerals/),
    ).not.toBeInTheDocument()
    expect(
      within(sheet).queryByRole('button', { name: /vitamins and minerals/ }),
    ).not.toBeInTheDocument()
    expect(within(sheet).getByRole('textbox', { name: /^Name/ })).toBeVisible()
  })
})
