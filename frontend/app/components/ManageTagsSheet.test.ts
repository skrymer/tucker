import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ManageTagsSheet from './ManageTagsSheet.vue'

// The rename field's autofocus is desktop-only, so the tests drive the viewport.
const viewport = vi.hoisted(() => ({ desktop: true }))
mockNuxtImport('useIsDesktop', () => () => ref(viewport.desktop))

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  remove: vi.fn(),
}))

describe('ManageTagsSheet', () => {
  beforeEach(() => {
    viewport.desktop = true
  })

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

  it('lists what the server holds after a delete, even while an earlier re-read is still on its way', async () => {
    const kept = [{ id: 9, name: 'snack', foodCount: 3 }]
    let reads = 0
    let releaseSecondRead: () => void = () => {}
    registerEndpoint('/api/tags', {
      method: 'GET',
      handler: async () => {
        reads++
        const answer = [...kept]
        if (reads === 2)
          await new Promise<void>((resolve) => (releaseSecondRead = resolve))
        return answer
      },
    })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: () => {
        kept.push({ id: 10, name: 'Lunch', foodCount: 0 })
        return { id: 10, name: 'Lunch', foodCount: 0 }
      },
    })
    registerEndpoint('/api/tags/9', {
      method: 'DELETE',
      handler: () => {
        kept.splice(0, 1)
        return null
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await screen.findByText('snack')

    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'Lunch')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await vi.waitFor(() => expect(reads).toBe(2))
    await user.click(screen.getByRole('button', { name: 'Delete snack' }))
    await user.click(screen.getByRole('button', { name: 'Delete tag' }))
    await vi.waitFor(() => expect(reads).toBe(3))
    releaseSecondRead()

    await vi.waitFor(() =>
      expect(
        screen.getAllByRole('listitem').map((row) => row.textContent),
      ).toEqual([expect.stringContaining('Lunch')]),
    )
  })

  it('reopens on the list at rest, not on a delete it was asking about when it closed', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    const { rerender } = await renderSuspended(ManageTagsSheet, {
      props: { open: true },
    })
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Delete snack' }))

    await rerender({ open: false })
    await rerender({ open: true })

    expect(screen.queryByText(/It comes off/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete snack' })).toBeVisible()
  })

  it('holds the delete button while a delete is in flight', async () => {
    let deletes = 0
    let answer: () => void = () => {}
    registerEndpoint('/api/tags', () => [
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    registerEndpoint('/api/tags/9', {
      method: 'DELETE',
      handler: () => {
        deletes++
        return new Promise<null>((resolve) => (answer = () => resolve(null)))
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Delete snack' }),
    )

    await user.click(screen.getByRole('button', { name: 'Delete tag' }))

    await vi.waitFor(() => expect(deletes).toBe(1))
    expect(screen.getByRole('button', { name: /Delete tag/ })).toBeDisabled()
    answer()
  })

  it('holds the add button while a create is in flight', async () => {
    let posts = 0
    let answer: () => void = () => {}
    registerEndpoint('/api/tags', { method: 'GET', handler: () => [] })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: () => {
        posts++
        return new Promise((resolve) => {
          answer = () => resolve({ id: 8, name: 'Lunch', foodCount: 0 })
        })
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'Lunch')

    await user.click(screen.getByRole('button', { name: 'Add' }))

    await vi.waitFor(() => expect(posts).toBe(1))
    expect(screen.getByRole('button', { name: /Add/ })).toBeDisabled()
    answer()
  })

  it('names a delete that failed for want of a connection in its own error toast', async () => {
    toastAdd.mockClear()
    registerEndpoint('/api/tags', () => [
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    registerEndpoint('/api/tags/9', {
      method: 'DELETE',
      handler: (event) => {
        setResponseStatus(event, 503)
        return {}
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Delete snack' }),
    )

    await user.click(screen.getByRole('button', { name: 'Delete tag' }))

    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not delete tag' }),
      ),
    )
    expect(screen.getByText('3 foods', { exact: false })).toBeInTheDocument()
  })

  it('names a create that failed for want of a connection in its own error toast', async () => {
    toastAdd.mockClear()
    registerEndpoint('/api/tags', { method: 'GET', handler: () => [] })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: (event) => {
        setResponseStatus(event, 503)
        return {}
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'Lunch')

    await user.click(screen.getByRole('button', { name: 'Add' }))

    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not add tag' }),
      ),
    )
    expect(screen.getByRole('textbox', { name: 'New tag' })).toHaveValue(
      'Lunch',
    )
  })

  it('asks for a name when Add is pressed on an empty field, and sends nothing', async () => {
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

    await userEvent.setup().click(screen.getByRole('button', { name: 'Add' }))

    expect(
      await screen.findByText('Enter a name for this tag', { exact: true }),
    ).toBeVisible()
    expect(posts).toBe(0)
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

  it('states a name the server refuses beside the field, with no Retry toast', async () => {
    toastAdd.mockClear()
    registerEndpoint('/api/tags', { method: 'GET', handler: () => [] })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: (event) => {
        setResponseStatus(event, 400)
        return { message: 'a Tag name must be at most 30 characters' }
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'Lunch')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(
      await screen.findByText('a Tag name must be at most 30 characters', {
        exact: true,
      }),
    ).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'New tag' })).toHaveValue(
      'Lunch',
    )
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('lets go of the server’s refusal once the name it refused is edited', async () => {
    registerEndpoint('/api/tags', { method: 'GET', handler: () => [] })
    registerEndpoint('/api/tags', {
      method: 'POST',
      handler: (event) => {
        setResponseStatus(event, 400)
        return { message: 'a Tag name must be at most 30 characters' }
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    const field = screen.getByRole('textbox', { name: 'New tag' })
    await user.type(field, 'Lunch')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByText('a Tag name must be at most 30 characters')

    await user.clear(field)
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(
      screen.queryByText('a Tag name must be at most 30 characters'),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByText('Enter a name for this tag', { exact: true }),
    ).toBeVisible()
  })

  it('renames a Tag, lists it under its new name, and tells the page its Foods changed', async () => {
    const kept = [
      { id: 7, name: 'Breakfast', foodCount: 1 },
      { id: 9, name: 'snack', foodCount: 3 },
    ]
    const sent: unknown[] = []
    registerEndpoint('/api/tags', { method: 'GET', handler: () => [...kept] })
    registerEndpoint('/api/tags/9', {
      method: 'PUT',
      handler: async (event) => {
        const body = await readBody(event)
        sent.push(body)
        kept[1] = { id: 9, name: body.name, foodCount: 3 }
        return { tag: kept[1], merged: false }
      },
    })
    const onChanged = vi.fn()
    await renderSuspended(ManageTagsSheet, {
      props: { open: true, onChanged },
    })
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: 'Rename snack' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename snack' })
    expect(field).toHaveValue('snack')
    await user.clear(field)
    await user.type(field, 'Treats')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Treats')).toBeVisible()
    expect(sent).toEqual([{ name: 'Treats' }])
    expect(
      screen.queryByRole('textbox', { name: /Rename/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename Treats' })).toBeVisible()
    expect(onChanged).toHaveBeenCalledOnce()
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('warns that renaming onto another Tag’s name in any case merges the two, with both Food counts, before sending anything', async () => {
    let puts = 0
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Snack', foodCount: 3 },
      { id: 9, name: 'treats', foodCount: 1 },
    ])
    registerEndpoint('/api/tags/9', {
      method: 'PUT',
      handler: () => {
        puts++
        return null
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename treats' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename treats' })

    await user.clear(field)
    await user.type(field, ' SNACK ')

    expect(
      screen.getByText(
        '“Snack” already exists — its 3 foods and this tag’s 1 food become one tag.',
        { exact: true },
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Merge' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument()
    expect(puts).toBe(0)
  })

  it('treats respelling a Tag’s own name in another case as a rename, with no merge warning', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Snack', foodCount: 3 },
      { id: 9, name: 'treats', foodCount: 1 },
    ])
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename treats' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename treats' })

    await user.clear(field)
    await user.type(field, 'Treats')

    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Merge' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/already exists/)).not.toBeInTheDocument()
  })

  it('keeps a Tag whose rename is cancelled, back as it was', async () => {
    let puts = 0
    registerEndpoint('/api/tags', () => [
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    registerEndpoint('/api/tags/9', {
      method: 'PUT',
      handler: () => {
        puts++
        return null
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename snack' }),
    )
    await user.type(screen.getByRole('textbox', { name: 'Rename snack' }), 's')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(
      screen.queryByRole('textbox', { name: 'Rename snack' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('snack', { exact: true })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Rename snack' })).toBeVisible()
    expect(puts).toBe(0)
  })

  it('states a new name the server refuses beside the rename field, with no Retry toast', async () => {
    toastAdd.mockClear()
    registerEndpoint('/api/tags', () => [
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    registerEndpoint('/api/tags/9', {
      method: 'PUT',
      handler: (event) => {
        setResponseStatus(event, 400)
        return { message: 'a Tag name must be at most 30 characters' }
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename snack' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename snack' })
    await user.clear(field)
    await user.type(field, 'Treats')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('a Tag name must be at most 30 characters', {
        exact: true,
      }),
    ).toBeVisible()
    expect(field).toHaveValue('Treats')
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('reopens on the list at rest, not on a rename it was part-way through when it closed', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    const { rerender } = await renderSuspended(ManageTagsSheet, {
      props: { open: true },
    })
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Rename snack' }))

    await rerender({ open: false })
    await rerender({ open: true })

    expect(
      screen.queryByRole('textbox', { name: 'Rename snack' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename snack' })).toBeVisible()
  })

  it('asks one thing at a time: renaming a Tag drops a delete asked about on another, and asking to delete drops a rename', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Breakfast', foodCount: 1 },
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Delete Breakfast' }),
    )

    await user.click(screen.getByRole('button', { name: 'Rename snack' }))

    expect(screen.queryByText(/Delete “Breakfast”/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Rename snack' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Delete Breakfast' }))

    expect(
      screen.queryByRole('textbox', { name: 'Rename snack' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Delete “Breakfast”/)).toBeVisible()
  })

  it('holds the merge button while a rename is in flight', async () => {
    let puts = 0
    let answer: () => void = () => {}
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Snack', foodCount: 3 },
      { id: 9, name: 'treats', foodCount: 1 },
    ])
    registerEndpoint('/api/tags/9', {
      method: 'PUT',
      handler: () => {
        puts++
        return new Promise((resolve) => {
          answer = () =>
            resolve({
              tag: { id: 7, name: 'Snack', foodCount: 4 },
              merged: true,
            })
        })
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename treats' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename treats' })
    await user.clear(field)
    await user.type(field, 'snack')

    await user.click(screen.getByRole('button', { name: 'Merge' }))

    await vi.waitFor(() => expect(puts).toBe(1))
    expect(screen.getByRole('button', { name: /Merge/ })).toBeDisabled()
    answer()
  })

  it('refuses renaming a Tag to whitespace alone at the field, and sends nothing', async () => {
    let puts = 0
    registerEndpoint('/api/tags', () => [
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    registerEndpoint('/api/tags/9', {
      method: 'PUT',
      handler: () => {
        puts++
        return null
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename snack' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename snack' })
    await user.clear(field)
    await user.type(field, '   ')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Enter a name for this tag', { exact: true }),
    ).toBeVisible()
    expect(field).toBeInTheDocument()
    expect(puts).toBe(0)
  })

  it('lets go of the server’s refusal of a new name once that name is edited', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    registerEndpoint('/api/tags/9', {
      method: 'PUT',
      handler: (event) => {
        setResponseStatus(event, 400)
        return { message: 'a Tag name must be at most 30 characters' }
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename snack' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename snack' })
    await user.type(field, 's')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('a Tag name must be at most 30 characters')

    await user.type(field, 'x')

    expect(
      screen.queryByText('a Tag name must be at most 30 characters'),
    ).not.toBeInTheDocument()
    expect(field).toHaveValue('snacksx')
  })

  it('names a rename that failed for want of a connection in its own error toast, keeping the new name', async () => {
    toastAdd.mockClear()
    registerEndpoint('/api/tags', () => [
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    registerEndpoint('/api/tags/9', {
      method: 'PUT',
      handler: (event) => {
        setResponseStatus(event, 503)
        return {}
      },
    })
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename snack' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename snack' })
    await user.type(field, 's')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not rename tag' }),
      ),
    )
    expect(field).toHaveValue('snacks')
  })

  it('puts the cursor in the new-name field when a rename starts on desktop', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    await renderSuspended(ManageTagsSheet, { props: { open: true } })

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Rename snack' }))

    await vi.waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Rename snack' }),
      ).toHaveFocus(),
    )
  })

  it('leaves the new-name field unfocused when a rename starts on a phone, so its keyboard cannot cover the sheet', async () => {
    viewport.desktop = false
    registerEndpoint('/api/tags', () => [
      { id: 9, name: 'snack', foodCount: 3 },
    ])
    await renderSuspended(ManageTagsSheet, { props: { open: true } })

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Rename snack' }))

    const field = await screen.findByRole('textbox', { name: 'Rename snack' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(field).not.toHaveFocus()
  })

  it('warns of a merge onto a name pasted with a character the server trims and the browser keeps', async () => {
    registerEndpoint('/api/tags', () => [
      { id: 7, name: 'Snack', foodCount: 3 },
      { id: 9, name: 'treats', foodCount: 1 },
    ])
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename treats' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename treats' })

    await user.clear(field)
    await user.paste('\u001FSnack')

    expect(
      screen.getByText(
        '“Snack” already exists — its 3 foods and this tag’s 1 food become one tag.',
        { exact: true },
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Merge' })).toBeVisible()
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
