import { describe, expect, it, vi } from 'vitest'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ManageTagsSheet from './ManageTagsSheet.vue'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  remove: vi.fn(),
}))

describe('ManageTagsSheet', () => {
  it('lists every Tag in the order the server sends, each with how many Foods carry it', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Breakfast', foodCount: 1 },
      { id: 8, name: 'dinner', foodCount: 0 },
      { id: 9, name: 'snack', foodCount: 3 },
    ])

    await renderSuspended(ManageTagsSheet, { props: { open: true } })

    const sheet = screen.getByRole('dialog', { name: 'Manage tags' })
    const rows = await within(sheet).findAllByRole('listitem')
    const expected = [
      ['Breakfast', '1 food'],
      ['dinner', '0 foods'],
      ['snack', '3 foods'],
    ]
    expect(rows).toHaveLength(expected.length)
    expected.forEach(([name, count], i) => {
      expect(within(rows[i]!).getByText(name!)).toBeVisible()
      expect(within(rows[i]!).getByText(count!)).toBeVisible()
    })
  })

  it('asks before deleting a Tag, naming how many Foods it comes off and that they stay', async () => {
    let deletes = 0
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Breakfast', foodCount: 1 },
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    registerEndpoint('/api/tags/9', {
      method: 'DELETE',
      handler: () => {
        deletes++
        return null
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Delete snack' }))

    expect(
      screen.getByText(
        'Delete “snack”? It comes off 3 foods. The foods stay in your catalog.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delete tag' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible()
    expect(deletes).toBe(0)
  })

  it('creates a Tag from the name typed, and lists it once the server has it', async () => {
    const kept = [{ id: 7, name: 'Breakfast', foodCount: 1 }]
    const sent: unknown[] = []
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: () => [...kept],
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: async (event) => {
        const body = await readBody(event)
        sent.push(body)
        const created = { id: 8, name: body.name, foodCount: 0 }
        kept.push(created)
        return created
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'Lunch')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Lunch')).toBeVisible()
    expect(sent).toEqual([{ name: 'Lunch' }])
    expect(screen.getByRole('textbox', { name: 'New tag' })).toHaveValue('')
  })
})
