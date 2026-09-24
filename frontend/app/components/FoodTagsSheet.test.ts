import { describe, expect, it, vi } from 'vitest'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import FoodTagsSheet from './FoodTagsSheet.vue'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  remove: vi.fn(),
}))

const oats = {
  id: 1,
  name: 'ROLLED OATS',
  tags: [{ id: 7, name: 'Breakfast' }],
}

describe('FoodTagsSheet', () => {
  it('opens on the Food, showing the Tags it already carries', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Breakfast', foodCount: 1 },
    ])

    await renderSuspended(FoodTagsSheet, { props: { food: oats } })

    const sheet = screen.getByRole('dialog', { name: 'Tags for Rolled oats' })
    expect(sheet).toBeVisible()
    expect(await screen.findByText('Breakfast')).toBeVisible()
  })

  it('asks for no Tags while it is closed', async () => {
    let asked = 0
    registerEndpoint('/api/tags', () => {
      asked++
      return []
    })

    await renderSuspended(FoodTagsSheet, { props: { food: null } })

    expect(asked).toBe(0)
  })

  it('opens on an empty field, offering nothing until the Tags have loaded', async () => {
    registerEndpoint('/api/tags', (event) => {
      setResponseStatus(event, 500)
      return {}
    })
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const picker = screen.getByRole('combobox', { name: 'Tags' })

    expect(picker).toHaveValue('')
    await userEvent.setup().click(picker)
    expect(screen.queryAllByRole('option')).toEqual([])
  })

  it('names its picker, so a screen reader knows what it is choosing', async () => {
    registerEndpoint('/api/tags', () => [])

    await renderSuspended(FoodTagsSheet, { props: { food: oats } })

    expect(screen.getByRole('combobox', { name: 'Tags' })).toBeVisible()
  })

  it('offers every Tag the User keeps, alphabetically as the server lists them', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Breakfast', foodCount: 1 },
      { id: 8, name: 'dinner', foodCount: 0 },
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })

    await userEvent.setup().click(screen.getByRole('combobox'))

    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'Breakfast',
      'dinner',
      'snack',
    ])
  })

  it('saves the Tags chosen, beside the ones the Food already carried', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Breakfast', foodCount: 1 },
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    const onSave = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onSave } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'snack' }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    expect(onSave).toHaveBeenCalledWith([7, 9])
  })

  it('creates a Tag the moment a new name is typed, so saving sends only ids', async () => {
    const created: unknown[] = []
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [{ id: 7, name: 'Breakfast', foodCount: 1 }],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: async (event) => {
        created.push(await readBody(event))
        return { id: 20, name: 'post-workout', foodCount: 0 }
      },
    })
    const onSave = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onSave } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox'), 'post-workout')
    await user.click(
      await screen.findByRole('option', { name: /post-workout/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    expect(created).toEqual([{ name: 'post-workout' }])
    expect(onSave).toHaveBeenCalledWith([7, 20])
  })

  it('creates a name typed with surrounding spaces and entered from the keyboard', async () => {
    const created: unknown[] = []
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: async (event) => {
        created.push(await readBody(event))
        return { id: 21, name: 'hello', foodCount: 0 }
      },
    })
    const onSave = vi.fn()
    await renderSuspended(FoodTagsSheet, {
      props: { food: { ...oats, tags: [] }, onSave },
    })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), '  hello  ')
    await user.keyboard('{Enter}')
    await vi.waitFor(() => expect(created).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    expect(onSave).toHaveBeenCalledWith([21])
  })

  it('empties the field once a typed Tag is created, so it is not offered again', async () => {
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: () => ({ id: 20, name: 'post-workout', foodCount: 0 }),
    })
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

  it('keeps one Tag when a typed name turns out to be one the Food already carries', async () => {
    // The list the sheet opened on may be stale; the server is what knows that
    // "BREAKFAST" is the User's "Breakfast", and answers with it (ADR 0033).
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: () => ({ id: 7, name: 'Breakfast', foodCount: 1 }),
    })
    const onSave = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onSave } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox'), 'BREAKFAST')
    await user.click(await screen.findByRole('option', { name: /BREAKFAST/ }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    expect(onSave).toHaveBeenCalledWith([7])
  })

  it('states why a refused name was refused, and adds nothing', async () => {
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: (event) => {
        setResponseStatus(event, 400)
        return { message: 'a Tag name must be at most 30 characters' }
      },
    })
    const onSave = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onSave } })
    const user = userEvent.setup()
    const tooLong = 'a'.repeat(31)

    await user.type(screen.getByRole('combobox'), tooLong)
    await user.click(await screen.findByRole('option', { name: /a{31}/ }))

    expect(
      await screen.findByText('a Tag name must be at most 30 characters'),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save tags' }))
    expect(onSave).toHaveBeenCalledWith([7])
  })

  it('closes its list once a Tag is picked, so Save is not covered', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Breakfast', foodCount: 1 },
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'snack' }))

    await vi.waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    )
  })

  it('closes its list once a typed Tag is created, so Save is not covered', async () => {
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [{ id: 9, name: 'snack', foodCount: 3 }],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: () => ({ id: 20, name: 'dinner', foodCount: 0 }),
    })
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'dinner')
    await user.click(await screen.findByRole('option', { name: /dinner/ }))

    await vi.waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    )
  })

  it('puts a refused name back in the field, to be corrected', async () => {
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: (event) => {
        setResponseStatus(event, 400)
        return { message: 'a Tag name must be at most 30 characters' }
      },
    })
    await renderSuspended(FoodTagsSheet, { props: { food: oats } })
    const user = userEvent.setup()
    const picker = screen.getByRole('combobox', { name: 'Tags' })
    const tooLong = 'a'.repeat(31)

    await user.type(picker, tooLong)
    await user.click(await screen.findByRole('option', { name: /a{31}/ }))

    await screen.findByRole('alert')
    expect(picker).toHaveValue(tooLong)
  })

  it('adds a created Tag to a Food that carried none', async () => {
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: () => ({ id: 20, name: 'snack', foodCount: 0 }),
    })
    const onSave = vi.fn()
    await renderSuspended(FoodTagsSheet, {
      props: { food: { ...oats, tags: [] }, onSave },
    })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox'), 'snack')
    await user.click(await screen.findByRole('option', { name: /snack/ }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    expect(onSave).toHaveBeenCalledWith([20])
  })

  it('names a create that failed for want of a connection in its own error toast', async () => {
    toastAdd.mockClear()
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: (event) => {
        setResponseStatus(event, 503)
        return {}
      },
    })
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

  it('forgets a refused name when it is opened on another Food', async () => {
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: (event) => {
        setResponseStatus(event, 400)
        return { message: 'a Tag name must be at most 30 characters' }
      },
    })
    const { rerender } = await renderSuspended(FoodTagsSheet, {
      props: { food: oats },
    })
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox'), 'a'.repeat(31))
    await user.click(await screen.findByRole('option', { name: /a{31}/ }))
    await screen.findByRole('alert')

    await rerender({ food: { id: 2, name: 'Bread', tags: [] } })

    await vi.waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('combobox', { name: 'Tags' })).toHaveValue('')
  })

  it('holds Save until a typed Tag has been created', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: async () => {
        await held
        return { id: 20, name: 'dinner', foodCount: 0 }
      },
    })
    const onSave = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onSave } })
    const user = userEvent.setup()
    const picker = screen.getByRole('combobox', { name: 'Tags' })

    await user.type(picker, 'dinner')
    await user.click(await screen.findByRole('option', { name: /dinner/ }))

    const save = screen.getByRole('button', { name: 'Save tags' })
    await vi.waitFor(() => expect(save).toBeDisabled())

    release()
    await vi.waitFor(() => expect(save).toBeEnabled())
    await user.click(save)
    expect(onSave).toHaveBeenCalledWith([7, 20])
  })

  it('keeps a second name typed while the first is being created', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: async () => {
        await held
        return { id: 20, name: 'dinner', foodCount: 0 }
      },
    })
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
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: async () => {
        await held
        return { id: 20, name: 'dinner', foodCount: 0 }
      },
    })
    const onSave = vi.fn()
    const { rerender } = await renderSuspended(FoodTagsSheet, {
      props: { food: oats, onSave },
    })
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox'), 'dinner')
    await user.click(await screen.findByRole('option', { name: /dinner/ }))

    await rerender({ food: { id: 2, name: 'Bread', tags: [] }, onSave })
    release()
    const save = screen.getByRole('button', { name: 'Save tags' })
    await vi.waitFor(() => expect(save).toBeEnabled())
    await user.click(save)

    expect(onSave).toHaveBeenCalledWith([])
  })

  it('holds Save while the page is saving', async () => {
    registerEndpoint('/api/tags', () => [])

    await renderSuspended(FoodTagsSheet, {
      props: { food: oats, saving: true },
    })

    expect(screen.getByRole('button', { name: 'Save tags' })).toBeDisabled()
  })

  it('keeps a Tag the Food carries when its name is typed and entered again', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Breakfast', foodCount: 1 },
    ])
    const onSave = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onSave } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'Breakfast')
    await screen.findByRole('option', { name: 'Breakfast' })
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    expect(onSave).toHaveBeenCalledWith([7])
  })

  it('saves a Food with a Tag taken off as no longer carrying it', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Breakfast', foodCount: 1 },
    ])
    const onSave = vi.fn()
    await renderSuspended(FoodTagsSheet, { props: { food: oats, onSave } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Breakfast' }))
    await user.click(screen.getByRole('button', { name: 'Save tags' }))

    expect(onSave).toHaveBeenCalledWith([])
  })
})
