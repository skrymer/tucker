import { describe, expect, it, vi } from 'vitest'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
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
})
