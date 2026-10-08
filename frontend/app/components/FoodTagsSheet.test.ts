import { describe, expect, it, vi } from 'vitest'
import { getResponse } from 'msw'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import {
  foodCatalog,
  tagNameTooLong,
  type ShelvedTag,
} from '~~/test/mocks/handlers/catalog'
import { failingRead, held, http, noConnection } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { food, type FoodResponse } from '~~/test/food-fixtures'
import FoodTagsSheet from './FoodTagsSheet.vue'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  remove: vi.fn(),
}))

const oats = food({
  id: 1,
  name: 'ROLLED OATS',
  tags: [{ id: 7, name: 'Breakfast' }],
})

const breakfast: ShelvedTag = { id: 7, name: 'Breakfast', foodCount: 1 }
const snack: ShelvedTag = { id: 9, name: 'snack', foodCount: 3 }

/** The User keeps exactly [tags]. */
const keeps = (...tags: ShelvedTag[]) => server.use(...foodCatalog({ tags }))

/**
 * A catalog holding [foods] and keeping [tags]. Returns a read of the Tag ids
 * a Food carries in it, in id order — which Tags, not the order the server
 * lists them in.
 */
function catalogHolding(foods: FoodResponse[], ...tags: ShelvedTag[]) {
  const catalog = foodCatalog({ foods, tags })
  server.use(...catalog)
  return async (id: number) => {
    const read = new Request('http://localhost/api/foods')
    const held: FoodResponse[] = await (await getResponse(
      catalog,
      read,
    ))!.json()
    return held
      .find((row) => row.id === id)
      ?.tags.map((tag) => tag.id)
      .sort((a, b) => a - b)
  }
}

/** Over 30 characters, which the server refuses as a Tag name. */
const tooLong = 'a'.repeat(31)

/** Creates — of [name] alone, if given — held until released. */
const heldCreates = (name?: string) =>
  held(
    'post',
    '/api/tags',
    name ? async (request) => (await request.json()).name === name : undefined,
  )

/** The first create fails for want of a connection; the next falls through. */
const firstCreateUnreachable = () =>
  http.post('/api/tags', ({ response }) => response(503).json(noConnection), {
    once: true,
  })

/** Retry the action on the last failure toast the User was shown. */
const retryLastToast = () => toastAdd.mock.calls.at(-1)![0].actions[0].onClick()

describe('FoodTagsSheet', () => {
  it('opens on the Food, showing the Tags it already carries', async () => {
    keeps(breakfast)

    await renderSuspended(FoodTagsSheet, { props: { food: oats } })

    const sheet = screen.getByRole('dialog', { name: 'Tags for Rolled oats' })
    expect(sheet).toBeVisible()
    expect(await screen.findByText('Breakfast')).toBeVisible()
  })

  it('offers the Tags the User keeps when it opens, not those kept when it was rendered shut', async () => {
    keeps()
    const { rerender } = await renderSuspended(FoodTagsSheet, {
      props: { food: null },
    })
    // Created elsewhere — on another device, or in Manage tags — while shut.
    await $fetch('/api/tags', { method: 'POST', body: { name: 'snack' } })

    await rerender({ food: oats })
    await userEvent
      .setup()
      .click(screen.getByRole('combobox', { name: 'Tags' }))

    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'snack',
    ])
  })

  it('opens on an empty field, offering nothing until the Tags have loaded', async () => {
    // A Tag is kept, so a read that landed would have something to offer.
    keeps(snack)
    server.use(failingRead('/api/tags'))
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const picker = screen.getByRole('combobox', { name: 'Tags' })

    expect(picker).toHaveValue('')
    await userEvent.setup().click(picker)
    expect(screen.queryAllByRole('option')).toEqual([])
  })

  it('names its picker, so a screen reader knows what it is choosing', async () => {
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })

    expect(screen.getByRole('combobox', { name: 'Tags' })).toBeVisible()
  })

  it('offers every Tag the User keeps, alphabetically as the server lists them', async () => {
    keeps(snack, { id: 8, name: 'dinner', foodCount: 0 }, breakfast)
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })

    await userEvent.setup().click(screen.getByRole('combobox'))

    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'Breakfast',
      'dinner',
      'snack',
    ])
  })

  it('closes itself once the Tags it saved have landed', async () => {
    const tagsOn = catalogHolding([oats], breakfast, snack)
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onClose } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'snack' }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([7, 9])
  })

  it('creates a Tag the moment a new name is typed, so saving sends only ids', async () => {
    const tagsOn = catalogHolding([oats], breakfast)
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onClose } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox'), 'post-workout')
    await user.click(
      await screen.findByRole('option', { name: /post-workout/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    // 20 is the id the server gave the Tag it created; nothing else knows it.
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([7, 20])
  })

  it('creates a name typed with surrounding spaces and entered from the keyboard', async () => {
    const tagsOn = catalogHolding([{ ...oats, tags: [] }])
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, {
      props: { food: { ...oats, tags: [] }, onClose },
    })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), '  hello  ')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('hello', { exact: true })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([20])
  })

  it('empties the field once a typed Tag is created, so it is not offered again', async () => {
    keeps()
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()
    const picker = screen.getByRole('combobox', { name: 'Tags' })

    await user.type(picker, 'post-workout')
    await user.click(
      await screen.findByRole('option', { name: /post-workout/ }),
    )

    await vi.waitFor(() => expect(picker).toHaveValue(''))
    expect(
      screen.queryByRole('option', { name: /Create/ }),
    ).not.toBeInTheDocument()
  })

  it('shows one chip for a typed name that turns out to be a Tag the Food carries', async () => {
    catalogHolding([oats], breakfast)
    server.use(http.get('/api/tags', ({ response }) => response(200).json([])))
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox'), 'BREAKFAST')
    await user.click(await screen.findByRole('option', { name: /BREAKFAST/ }))

    await vi.waitFor(() => expect(screen.getByRole('combobox')).toHaveValue(''))
    expect(screen.getAllByText('Breakfast')).toHaveLength(1)
  })

  it('shows each Tag once after one more is picked from the list', async () => {
    catalogHolding([oats], breakfast, snack)
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'snack' }))

    await vi.waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    )
    expect(screen.getAllByText('Breakfast')).toHaveLength(1)
    expect(screen.getAllByText('snack')).toHaveLength(1)
  })

  it('keeps one Tag when a typed name turns out to be one the Food already carries', async () => {
    // The list the sheet opened on may be stale; the server is what knows that
    // "BREAKFAST" is the User's "Breakfast", and answers with it (ADR 0033).
    const tagsOn = catalogHolding([oats], breakfast)
    server.use(http.get('/api/tags', ({ response }) => response(200).json([])))
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onClose } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox'), 'BREAKFAST')
    await user.click(await screen.findByRole('option', { name: /BREAKFAST/ }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([7])
  })

  it('states why a refused name was refused, and adds nothing', async () => {
    const tagsOn = catalogHolding([oats])
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onClose } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox'), tooLong)
    await user.click(await screen.findByRole('option', { name: /a{31}/ }))

    expect(await screen.findByText(tagNameTooLong)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save tags' }))
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([7])
  })

  it('closes its list once a Tag is picked, so Save is not covered', async () => {
    keeps(breakfast, snack)
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'snack' }))

    await vi.waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    )
  })

  it('closes its list once a typed Tag is created, so Save is not covered', async () => {
    keeps(snack)
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'dinner')
    await user.click(await screen.findByRole('option', { name: /dinner/ }))

    await vi.waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    )
  })

  it('puts a refused name back in the field, to be corrected', async () => {
    keeps()
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()
    const picker = screen.getByRole('combobox', { name: 'Tags' })

    await user.type(picker, tooLong)
    await user.click(await screen.findByRole('option', { name: /a{31}/ }))

    await screen.findByRole('alert')
    expect(picker).toHaveValue(tooLong)
  })

  it('leaves a name typed while an earlier one was refused where it is', async () => {
    keeps()
    const { handler, release } = heldCreates()
    server.use(handler)
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()
    const picker = screen.getByRole('combobox', { name: 'Tags' })

    await user.type(picker, tooLong)
    await user.click(await screen.findByRole('option', { name: /a{31}/ }))
    await user.type(picker, 'lunch')
    release()

    await screen.findByRole('alert')
    expect(picker).toHaveValue('lunch')
  })

  it('adds a created Tag to a Food that carried none', async () => {
    const tagsOn = catalogHolding([{ ...oats, tags: [] }])
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, {
      props: { food: { ...oats, tags: [] }, onClose },
    })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox'), 'snack')
    await user.click(await screen.findByRole('option', { name: /snack/ }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([20])
  })

  it('names a create that failed for want of a connection in its own error toast', async () => {
    toastAdd.mockClear()
    keeps()
    server.use(firstCreateUnreachable())
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox'), 'snack')
    await user.click(await screen.findByRole('option', { name: /snack/ }))

    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not add tag' }),
      ),
    )
  })

  it('holds Save while a failed Tag is retried from its toast', async () => {
    toastAdd.mockClear()
    keeps()
    server.use(heldCreates().handler)
    server.use(firstCreateUnreachable())
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox'), 'snack')
    await user.click(await screen.findByRole('option', { name: /snack/ }))
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    retryLastToast()

    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save tags' })).toBeDisabled(),
    )
  })

  it('puts a name refused on its Retry back in the field, to be corrected', async () => {
    toastAdd.mockClear()
    keeps()
    server.use(firstCreateUnreachable())
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()
    const picker = screen.getByRole('combobox')

    await user.type(picker, tooLong)
    await user.click(await screen.findByRole('option', { name: /a{31}/ }))
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    retryLastToast()

    await screen.findByRole('alert')
    expect(picker).toHaveValue(tooLong)
  })

  it('keeps a failed Tag retried while a later name is being created', async () => {
    toastAdd.mockClear()
    const tagsOn = catalogHolding([{ ...oats, tags: [] }])
    const lunch = heldCreates('lunch')
    server.use(lunch.handler)
    server.use(firstCreateUnreachable())
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, {
      props: { food: { ...oats, tags: [] }, onClose },
    })
    const user = userEvent.setup()
    const picker = screen.getByRole('combobox')

    await user.type(picker, 'snack')
    await user.click(await screen.findByRole('option', { name: /snack/ }))
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    await user.type(picker, 'lunch')
    await user.click(await screen.findByRole('option', { name: /lunch/ }))
    retryLastToast()
    lunch.release()

    expect(await screen.findByText('snack', { exact: true })).toBeVisible()
    const save = screen.getByRole('button', { name: 'Save tags' })
    await vi.waitFor(() => expect(save).toBeEnabled())
    await user.click(save)
    // Lunch, then the snack its Retry created after it.
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([20, 21])
  })

  it('keeps a name entered while a failed Tag is being retried', async () => {
    toastAdd.mockClear()
    const tagsOn = catalogHolding([{ ...oats, tags: [] }])
    const retried = heldCreates('snack')
    server.use(retried.handler)
    server.use(firstCreateUnreachable())
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, {
      props: { food: { ...oats, tags: [] }, onClose },
    })
    const user = userEvent.setup()
    const picker = screen.getByRole('combobox')

    await user.type(picker, 'snack')
    await user.click(await screen.findByRole('option', { name: /snack/ }))
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    retryLastToast()
    await user.type(picker, 'lunch')
    await user.click(await screen.findByRole('option', { name: /lunch/ }))
    retried.release()

    const save = screen.getByRole('button', { name: 'Save tags' })
    await vi.waitFor(() => expect(save).toBeEnabled())
    await user.click(save)
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([20, 21])
  })

  it('forgets a refused name when it is opened on another Food', async () => {
    keeps()
    const { rerender } = await renderSuspended(FoodTagsSheet, {
      props: { food: oats },
    })
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox'), tooLong)
    await user.click(await screen.findByRole('option', { name: /a{31}/ }))
    await screen.findByRole('alert')

    await rerender({ food: { id: 2, name: 'Bread', tags: [] } })

    await vi.waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('combobox', { name: 'Tags' })).toHaveValue('')
  })

  it('holds Save until a typed Tag has been created', async () => {
    const tagsOn = catalogHolding([oats])
    const { handler, release } = heldCreates()
    server.use(handler)
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onClose } })
    const user = userEvent.setup()
    const picker = screen.getByRole('combobox', { name: 'Tags' })

    await user.type(picker, 'dinner')
    await user.click(await screen.findByRole('option', { name: /dinner/ }))

    const save = screen.getByRole('button', { name: 'Save tags' })
    await vi.waitFor(() => expect(save).toBeDisabled())

    release()
    await vi.waitFor(() => expect(save).toBeEnabled())
    await user.click(save)
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([7, 20])
  })

  it('keeps a second name typed while the first is being created', async () => {
    keeps()
    const { handler, release } = heldCreates()
    server.use(handler)
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()
    const picker = screen.getByRole('combobox', { name: 'Tags' })
    await user.type(picker, 'dinner')
    await user.click(await screen.findByRole('option', { name: /dinner/ }))

    await user.type(picker, 'lunch')
    expect(picker).toHaveValue('lunch')
    release()

    await vi.waitFor(() => expect(screen.getByText('dinner')).toBeVisible())
    expect(picker).toHaveValue('lunch')
  })

  it('keeps a Tag created for one Food off the next Food the sheet opens on', async () => {
    const bread = food({ id: 2, name: 'Bread' })
    const tagsOn = catalogHolding([oats, bread])
    const { handler, release } = heldCreates()
    server.use(handler)
    const onClose = vi.fn()
    const { rerender } = await renderSuspended(FoodTagsSheet, {
      props: { food: oats, onClose },
    })
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox'), 'dinner')
    await user.click(await screen.findByRole('option', { name: /dinner/ }))

    await rerender({ food: bread, onClose })
    release()
    const save = screen.getByRole('button', { name: 'Save tags' })
    await vi.waitFor(() => expect(save).toBeEnabled())
    await user.click(save)

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(bread.id)).toEqual([])
  })

  it('holds Save while its save is in flight', async () => {
    catalogHolding([oats], breakfast)
    const { handler, arrived, release } = held('put', '/api/foods/{id}/tags')
    server.use(handler)
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const save = screen.getByRole('button', { name: 'Save tags' })

    await userEvent.setup().click(save)
    await arrived

    expect(save).toBeDisabled()
    release()
  })

  it('opens with its Tag list shut, so Save is not covered', async () => {
    keeps(breakfast)
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })

    await screen.findByRole('button', { name: 'Save tags' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('takes one Tag off a Food carrying two, and keeps the other', async () => {
    const carryingBoth = {
      ...oats,
      tags: [...oats.tags, { id: 9, name: 'snack' }],
    }
    const tagsOn = catalogHolding([carryingBoth], breakfast, {
      ...snack,
      foodCount: 1,
    })
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, {
      props: { food: carryingBoth, onClose },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'snack' }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([7])
  })

  it('keeps a Tag the Food carries when its name is typed and entered again', async () => {
    const tagsOn = catalogHolding([oats], breakfast)
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onClose } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'Breakfast')
    await screen.findByRole('option', { name: 'Breakfast' })
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([7])
  })

  it('takes a Tag off when it is clicked in a list narrowed by a typed name', async () => {
    const tagsOn = catalogHolding([oats], breakfast)
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onClose } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'Break')
    await user.click(await screen.findByRole('option', { name: 'Breakfast' }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([])
  })

  it('takes a Tag off from the keyboard when nothing is typed', async () => {
    const tagsOn = catalogHolding([oats], breakfast)
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onClose } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await screen.findByRole('option', { name: 'Breakfast' })
    await user.keyboard('{ArrowDown}{Enter}')
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([])
  })

  it('takes a Tag off by a click after its name was entered again', async () => {
    const tagsOn = catalogHolding([oats], breakfast)
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onClose } })
    const user = userEvent.setup()
    const picker = screen.getByRole('combobox', { name: 'Tags' })

    await user.type(picker, 'Breakfast')
    await screen.findByRole('option', { name: 'Breakfast' })
    await user.keyboard('{Enter}')
    await user.type(picker, 'Break')
    await user.click(await screen.findByRole('option', { name: 'Breakfast' }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([])
  })

  it('saves a Food with a Tag taken off as no longer carrying it', async () => {
    const tagsOn = catalogHolding([oats], breakfast)
    const onClose = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onClose } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Breakfast' }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await tagsOn(oats.id)).toEqual([])
  })
})
