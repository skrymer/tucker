import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { getResponse } from 'msw'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { openGate, settle } from '~~/test/async-gate'
import {
  foodCatalog,
  tagNameTooLong,
  type ShelvedTag,
} from '~~/test/mocks/handlers/catalog'
import { failingRead, held, http, noConnection } from '~~/test/mocks/http'
import { server, useMswServer } from '~~/test/mocks/node'
import ManageTagsSheet from './ManageTagsSheet.vue'

useMswServer()

// The rename field's autofocus is desktop-only, so the tests drive the viewport.
const viewport = vi.hoisted(() => ({ desktop: true }))
mockNuxtImport('useIsDesktop', () => () => ref(viewport.desktop))

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  remove: vi.fn(),
}))

const breakfast: ShelvedTag = { id: 7, name: 'Breakfast', foodCount: 1 }
const dinner: ShelvedTag = { id: 8, name: 'dinner', foodCount: 0 }
const snack: ShelvedTag = { id: 9, name: 'snack', foodCount: 3 }

/** The User keeps exactly [tags]. */
const keeps = (...tags: ShelvedTag[]) => server.use(...foodCatalog({ tags }))

const refusal = tagNameTooLong

/** Every create refused, as the server refuses a name it will not keep. */
const createRefused = () =>
  http.post('/api/tags', ({ response }) =>
    response(400).json({ message: refusal }),
  )

/** Every rename refused, as the server refuses a name it will not keep. */
const renameRefused = () =>
  http.put('/api/tags/{id}', ({ response }) =>
    response(400).json({ message: refusal }),
  )

type Rerender = (props: Record<string, unknown>) => Promise<void>

/** Close the sheet and open it again, which reads the Tags afresh. */
async function reopen(rerender: Rerender) {
  await rerender({ open: false })
  await rerender({ open: true })
}

describe('ManageTagsSheet', () => {
  beforeEach(() => {
    viewport.desktop = true
  })

  it('lists every Tag in the order the server sends, each with how many Foods carry it', async () => {
    keeps(snack, dinner, breakfast)

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
    keeps(breakfast)
    server.use(failingRead('/api/tags', () => failing))
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
    await renderSuspended(ManageTagsSheet, { props: { open: true } })

    expect(await screen.findByText('No tags yet.')).toBeVisible()
    expect(screen.queryAllByRole('listitem')).toEqual([])
  })

  it('asks before deleting a Tag, naming how many Foods it comes off and that they stay', async () => {
    keeps(breakfast, snack)
    const { rerender } = await renderSuspended(ManageTagsSheet, {
      props: { open: true },
    })

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
    // Asking deleted nothing: the server still keeps it.
    await reopen(rerender)
    expect(
      await screen.findByRole('button', { name: 'Delete snack' }),
    ).toBeVisible()
  })

  it('asks before deleting a Tag no Food carries, saying it is on none', async () => {
    keeps(dinner)
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
    keeps(snack)
    const { rerender } = await renderSuspended(ManageTagsSheet, {
      props: { open: true },
    })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Delete snack' }),
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText(/It comes off/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete snack' })).toBeVisible()
    expect(screen.getByText('3 foods')).toBeVisible()
    await reopen(rerender)
    expect(await screen.findByText('3 foods')).toBeVisible()
  })

  it('deletes a Tag once confirmed, drops it from the list, and tells the page its Foods changed', async () => {
    keeps(breakfast, snack)
    const onChanged = vi.fn()
    const { rerender } = await renderSuspended(ManageTagsSheet, {
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
    expect(onChanged).toHaveBeenCalledOnce()
    expect(toastAdd).not.toHaveBeenCalled()
    await reopen(rerender)
    await vi.waitFor(() =>
      expect(
        screen.getAllByRole('listitem').map((row) => row.textContent),
      ).toEqual([expect.stringContaining('Breakfast')]),
    )
  })

  it('lists what the server holds after a delete, even while an earlier re-read is still on its way', async () => {
    const shelf = foodCatalog({ tags: [snack] })
    // The read after the create is answered with what the server held when it
    // arrived — before the delete — and only once released.
    let holdNextRead = false
    const { gate: released, release } = openGate()
    let arrived!: () => void
    const staleReadArrived = new Promise<void>((resolve) => (arrived = resolve))
    server.use(...shelf)
    server.use(
      http.get('/api/tags', async ({ request }) => {
        if (!holdNextRead) return undefined
        holdNextRead = false
        const answer = await getResponse(shelf, request)
        arrived()
        await released
        return answer
      }),
      http.post('/api/tags', () => {
        holdNextRead = true
        return undefined
      }),
    )
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await screen.findByText('snack')

    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'Lunch')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await staleReadArrived
    await user.click(screen.getByRole('button', { name: 'Delete snack' }))
    await user.click(screen.getByRole('button', { name: 'Delete tag' }))
    await vi.waitFor(() =>
      expect(screen.queryByText(/Delete “snack”/)).not.toBeInTheDocument(),
    )
    release()

    await vi.waitFor(() =>
      expect(
        screen.getAllByRole('listitem').map((row) => row.textContent),
      ).toEqual([expect.stringContaining('Lunch')]),
    )
  })

  it('reopens on the list at rest, not on a delete it was asking about when it closed', async () => {
    keeps(snack)
    const { rerender } = await renderSuspended(ManageTagsSheet, {
      props: { open: true },
    })
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Delete snack' }))

    await reopen(rerender)

    expect(screen.queryByText(/It comes off/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete snack' })).toBeVisible()
  })

  it('holds the delete button while a delete is in flight', async () => {
    keeps(snack)
    const { handler, release } = held('delete', '/api/tags/{id}')
    server.use(handler)
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Delete snack' }),
    )

    await user.click(screen.getByRole('button', { name: 'Delete tag' }))

    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: /Delete tag/ })).toBeDisabled(),
    )
    release()
    expect(await screen.findByText('No tags yet.')).toBeVisible()
  })

  it('holds the add button while a create is in flight', async () => {
    keeps()
    const { handler, release } = held('post', '/api/tags')
    server.use(handler)
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'Lunch')

    await user.click(screen.getByRole('button', { name: 'Add' }))

    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: /Add/ })).toBeDisabled(),
    )
    release()
    expect(await screen.findByText('Lunch')).toBeVisible()
  })

  it('names a delete that failed for want of a connection in its own error toast', async () => {
    toastAdd.mockClear()
    keeps(snack)
    server.use(
      http.delete('/api/tags/{id}', ({ response }) =>
        response(503).json(noConnection),
      ),
    )
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
    server.use(
      http.post('/api/tags', ({ response }) =>
        response(503).json(noConnection),
      ),
    )
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
    await renderSuspended(ManageTagsSheet, { props: { open: true } })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Add' }))

    expect(
      await screen.findByText('Enter a name for this tag', { exact: true }),
    ).toBeVisible()
    // Sent, the server would have refused it in words of its own.
    await settle()
    expect(screen.queryByText(/must not be blank/)).not.toBeInTheDocument()
  })

  it('refuses a Tag name of whitespace alone at the field, and sends nothing', async () => {
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: 'New tag' }), '   ')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(
      await screen.findByText('Enter a name for this tag', { exact: true }),
    ).toBeVisible()
    expect(screen.queryByText(/at most 30 characters/)).not.toBeInTheDocument()
    await settle()
    expect(screen.queryByText(/must not be blank/)).not.toBeInTheDocument()
  })

  it('refuses a Tag name longer than 30 characters at the field, and sends nothing', async () => {
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
    await settle()
    expect(screen.queryByText(refusal)).not.toBeInTheDocument()
  })

  it('states a name the server refuses beside the field, with no Retry toast', async () => {
    toastAdd.mockClear()
    server.use(createRefused())
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'Lunch')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText(refusal, { exact: true })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'New tag' })).toHaveValue(
      'Lunch',
    )
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('lets go of the server’s refusal once the name it refused is edited', async () => {
    server.use(createRefused())
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    const field = screen.getByRole('textbox', { name: 'New tag' })
    await user.type(field, 'Lunch')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByText(refusal)

    await user.clear(field)
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.queryByText(refusal)).not.toBeInTheDocument()
    expect(
      await screen.findByText('Enter a name for this tag', { exact: true }),
    ).toBeVisible()
  })

  it('renames a Tag, lists it under its new name, and tells the page its Foods changed', async () => {
    keeps(breakfast, snack)
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
    expect(screen.getByText('3 foods')).toBeVisible()
    expect(
      screen.queryByRole('textbox', { name: /Rename/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename Treats' })).toBeVisible()
    expect(onChanged).toHaveBeenCalledOnce()
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('warns that renaming onto another Tag’s name in any case merges the two, with both Food counts, before sending anything', async () => {
    keeps(
      { id: 7, name: 'Snack', foodCount: 3 },
      { id: 9, name: 'treats', foodCount: 1 },
    )
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
  })

  it('treats respelling a Tag’s own name in another case as a rename, with no merge warning', async () => {
    keeps(
      { id: 7, name: 'Snack', foodCount: 3 },
      { id: 9, name: 'treats', foodCount: 1 },
    )
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
    keeps(snack)
    const { rerender } = await renderSuspended(ManageTagsSheet, {
      props: { open: true },
    })
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
    await reopen(rerender)
    expect(
      await screen.findByRole('button', { name: 'Rename snack' }),
    ).toBeVisible()
  })

  it('states a new name the server refuses beside the rename field, with no Retry toast', async () => {
    toastAdd.mockClear()
    keeps(snack)
    server.use(renameRefused())
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename snack' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename snack' })
    await user.clear(field)
    await user.type(field, 'Treats')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(refusal, { exact: true })).toBeVisible()
    expect(field).toHaveValue('Treats')
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('reopens on the list at rest, not on a rename it was part-way through when it closed', async () => {
    keeps(snack)
    const { rerender } = await renderSuspended(ManageTagsSheet, {
      props: { open: true },
    })
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Rename snack' }))

    await reopen(rerender)

    expect(
      screen.queryByRole('textbox', { name: 'Rename snack' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename snack' })).toBeVisible()
  })

  it('asks one thing at a time: renaming a Tag drops a delete asked about on another, and asking to delete drops a rename', async () => {
    keeps(breakfast, snack)
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
    keeps(
      { id: 7, name: 'Snack', foodCount: 3 },
      { id: 9, name: 'treats', foodCount: 1 },
    )
    const { handler, release } = held('put', '/api/tags/{id}')
    server.use(handler)
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename treats' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename treats' })
    await user.clear(field)
    await user.type(field, 'snack')

    await user.click(screen.getByRole('button', { name: 'Merge' }))

    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: /Merge/ })).toBeDisabled(),
    )
    release()
    // One Tag remains, under the spelling it already had, carrying both.
    await vi.waitFor(() =>
      expect(
        screen.getAllByRole('listitem').map((row) => row.textContent),
      ).toEqual([expect.stringMatching(/^Snack.*4 foods/)]),
    )
  })

  it('refuses renaming a Tag to whitespace alone at the field, and sends nothing', async () => {
    keeps(snack)
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
    await settle()
    expect(screen.queryByText(/must not be blank/)).not.toBeInTheDocument()
  })

  it('lets go of the server’s refusal of a new name once that name is edited', async () => {
    keeps(snack)
    server.use(renameRefused())
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Rename snack' }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename snack' })
    await user.type(field, 's')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(refusal)

    await user.type(field, 'x')

    expect(screen.queryByText(refusal)).not.toBeInTheDocument()
    expect(field).toHaveValue('snacksx')
  })

  it('names a rename that failed for want of a connection in its own error toast, keeping the new name', async () => {
    toastAdd.mockClear()
    keeps(snack)
    server.use(
      http.put('/api/tags/{id}', ({ response }) =>
        response(503).json(noConnection),
      ),
    )
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
    keeps(snack)
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
    keeps(snack)
    await renderSuspended(ManageTagsSheet, { props: { open: true } })

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Rename snack' }))

    const field = await screen.findByRole('textbox', { name: 'Rename snack' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(field).not.toHaveFocus()
  })

  it('warns of a merge onto a name pasted with a character the server trims and the browser keeps', async () => {
    keeps(
      { id: 7, name: 'Snack', foodCount: 3 },
      { id: 9, name: 'treats', foodCount: 1 },
    )
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
    keeps(breakfast)
    await renderSuspended(ManageTagsSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'Lunch')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Lunch')).toBeVisible()
    expect(screen.getByText('0 foods')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'New tag' })).toHaveValue('')
  })
})
