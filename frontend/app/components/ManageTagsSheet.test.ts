import { describe, expect, it, vi } from 'vitest'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
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

  it('says the Tags could not load, and lists them once a Retry reads them', async () => {
    let failing = true
    registerEndpoint('/api/tags', (event) => {
      if (failing) {
        setResponseStatus(event, 500)
        return {}
      }
      return [{ id: 7, name: 'Breakfast', foodCount: 1 }]
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })

    expect(await screen.findByText("Couldn't load your tags")).toBeVisible()
    expect(screen.queryByText('No tags yet.')).not.toBeInTheDocument()
    failing = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Breakfast')).toBeVisible()
    expect(
      screen.queryByText("Couldn't load your tags"),
    ).not.toBeInTheDocument()
  })

  it('says there are no Tags yet when the User keeps none', async () => {
    registerEndpoint('/api/tags', () => [])

    await renderSuspended(ManageTagsSheet, { props: { open: true } })

    expect(await screen.findByText('No tags yet.')).toBeVisible()
    expect(screen.queryAllByRole('listitem')).toEqual([])
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

  it('asks before deleting a Tag no Food carries, saying it is on none', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 8, name: 'dinner', foodCount: 0 },
    ])
    await renderSuspended(ManageTagsSheet, { props: { open: true } })

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Delete dinner' }))

    expect(
      screen.getByText('Delete “dinner”? No foods carry it.'),
    ).toBeVisible()
    expect(screen.queryByText(/It comes off/)).not.toBeInTheDocument()
  })

  it('keeps a Tag whose delete is cancelled, back as it was', async () => {
    let deletes = 0
    registerEndpoint('/api/tags', () => [
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
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Delete snack' }),
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText(/It comes off/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete snack' })).toBeVisible()
    expect(screen.getByText('3 foods')).toBeVisible()
    expect(deletes).toBe(0)
  })

  it('deletes a Tag once confirmed, drops it from the list, and tells the page its Foods changed', async () => {
    const kept = [
      { id: 7, name: 'Breakfast', foodCount: 1 },
      { id: 9, name: 'snack', foodCount: 3 },
    ]
    registerEndpoint('/api/tags', { method: 'GET', handler: () => [...kept] })
    registerEndpoint('/api/tags/9', {
      method: 'DELETE',
      handler: () => {
        kept.splice(1, 1)
        return null
      },
    })
    const onChanged = vi.fn()
    await renderSuspended(ManageTagsSheet, {
      props: { open: true, onChanged },
    })
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: 'Delete snack' }),
    )
    await user.click(screen.getByRole('button', { name: 'Delete tag' }))

    await vi.waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(1),
    )
    expect(screen.getByRole('listitem')).toHaveTextContent('Breakfast')
    expect(kept.map((tag) => tag.name)).toEqual(['Breakfast'])
    expect(onChanged).toHaveBeenCalledOnce()
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('refuses a Tag name of whitespace alone at the field, and sends nothing', async () => {
    let posts = 0
    registerEndpoint('/api/tags', { method: 'GET', handler: () => [] })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: () => {
        posts++
        return { id: 8, name: '', foodCount: 0 }
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: 'New tag' }), '   ')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(
      await screen.findByText('Enter a name for this tag', { exact: true }),
    ).toBeVisible()
    expect(screen.queryByText(/at most 30 characters/)).not.toBeInTheDocument()
    expect(posts).toBe(0)
  })

  it('refuses a Tag name longer than 30 characters at the field, and sends nothing', async () => {
    let posts = 0
    registerEndpoint('/api/tags', { method: 'GET', handler: () => [] })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: () => {
        posts++
        return { id: 8, name: 'x', foodCount: 0 }
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(
      screen.getByRole('textbox', { name: 'New tag' }),
      'abcdefghijklmnopqrstuvwxyzABCDE',
    )
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(
      await screen.findByText('A tag name is at most 30 characters', {
        exact: true,
      }),
    ).toBeVisible()
    expect(
      screen.queryByText('Enter a name for this tag'),
    ).not.toBeInTheDocument()
    expect(posts).toBe(0)
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
