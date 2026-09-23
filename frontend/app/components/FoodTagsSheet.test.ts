import { describe, expect, it, vi } from 'vitest'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import FoodTagsSheet from './FoodTagsSheet.vue'

const oats = {
  id: 1,
  name: 'ROLLED OATS',
  tags: [{ id: 7, name: 'Breakfast' }],
}

describe('FoodTagsSheet', () => {
  it('opens on the Food, showing the Tags it already wears', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Breakfast', foodCount: 1 },
    ])

    await renderSuspended(FoodTagsSheet, { props: { food: oats } })

    const sheet = screen.getByRole('dialog', { name: 'Tags for Rolled oats' })
    expect(sheet).toBeVisible()
    expect(await screen.findByText('Breakfast')).toBeVisible()
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

  it('saves the Tags chosen, beside the ones the Food already wore', async () => {
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

  it('keeps one Tag when a typed name turns out to be one the Food already wears', async () => {
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

  it('saves a Food with a Tag taken off as no longer wearing it', async () => {
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
