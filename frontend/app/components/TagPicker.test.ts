import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { foodCatalog, tagNameTooLong } from '~~/test/mocks/handlers/catalog'
import { failingRead, held, http, noConnection } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { settle } from '~~/test/async-gate'
import TagPicker from './TagPicker.vue'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  remove: vi.fn(),
}))

/** Over 30 characters, which the server refuses as a Tag name. */
const tooLong = 'a'.repeat(31)

type Tag = { id: number; name: string }

const breakfast: Tag = { id: 7, name: 'Breakfast' }
const snack: Tag = { id: 9, name: 'snack' }

/**
 * The picker as a form hosts it: its Tags held in the form's own state starting
 * from [carried], listed beside it so a test reads what was picked, and a Save
 * that waits while a typed Tag is being created, as every form's does.
 */
function hosting(carried: Tag[] = []) {
  return defineComponent({
    setup() {
      const tags = ref<Tag[]>([...carried])
      const creating = ref(false)
      return () => [
        h(TagPicker, {
          modelValue: tags.value,
          'onUpdate:modelValue': (value: Tag[]) => (tags.value = value),
          creating: creating.value,
          'onUpdate:creating': (value: boolean) => (creating.value = value),
        }),
        h(
          'ul',
          { 'aria-label': 'Picked' },
          tags.value.map((tag) => h('li', { key: tag.id }, tag.name)),
        ),
        h('button', { type: 'button', disabled: creating.value }, 'Save'),
      ]
    },
  })
}
const host = hosting()

/** The User keeps exactly [tags]. */
const keeps = (...tags: Tag[]) =>
  server.use(
    ...foodCatalog({ tags: tags.map((tag) => ({ ...tag, foodCount: 0 })) }),
  )

const picked = () =>
  within(screen.getByRole('list', { name: 'Picked' }))
    .queryAllByRole('listitem')
    .map((item) => item.textContent)

describe('TagPicker', () => {
  it('states why a refused name was refused, and picks nothing', async () => {
    server.use(...foodCatalog())
    await renderSuspended(host)
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), tooLong)
    await user.click(await screen.findByRole('option', { name: /a{31}/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(tagNameTooLong)
    expect(picked()).toEqual([])
  })

  it('puts a refused name back in the field, to be corrected', async () => {
    server.use(...foodCatalog())
    await renderSuspended(host)
    const user = userEvent.setup()
    const field = screen.getByRole('combobox', { name: 'Tags' })

    await user.type(field, tooLong)
    await user.click(await screen.findByRole('option', { name: /a{31}/ }))

    await screen.findByRole('alert')
    expect(field).toHaveValue(tooLong)
  })

  it('names a create that failed for want of a connection in its own error toast', async () => {
    toastAdd.mockClear()
    server.use(
      http.post(
        '/api/tags',
        ({ response }) => response(503).json(noConnection),
        {
          once: true,
        },
      ),
      ...foodCatalog(),
    )
    await renderSuspended(host)
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'snack')
    await user.click(await screen.findByRole('option', { name: /snack/ }))

    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not add tag' }),
      ),
    )
    expect(picked()).toEqual([])
  })

  it('creates a name typed with surrounding spaces and entered from the keyboard', async () => {
    keeps()
    await renderSuspended(host)
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), '  hello  ')
    await user.keyboard('{Enter}')

    await vi.waitFor(() => expect(picked()).toEqual(['hello']))
  })

  it('keeps one Tag when a typed name turns out to be one already picked', async () => {
    // The list it opened on may be stale; the server is what knows "BREAKFAST"
    // is the User's "Breakfast", and answers with it (ADR 0033).
    keeps(breakfast)
    server.use(http.get('/api/tags', ({ response }) => response(200).json([])))
    await renderSuspended(hosting([breakfast]))
    const user = userEvent.setup()
    const field = screen.getByRole('combobox', { name: 'Tags' })

    await user.type(field, 'BREAKFAST')
    await user.click(await screen.findByRole('option', { name: /BREAKFAST/ }))

    await vi.waitFor(() => expect(field).toHaveValue(''))
    expect(picked()).toEqual(['Breakfast'])
  })

  it('closes its list once a Tag is picked, so a Save below it is not covered', async () => {
    keeps(breakfast, snack)
    await renderSuspended(host)
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'snack' }))

    await vi.waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    )
    expect(picked()).toEqual(['snack'])
  })

  it('closes its list once a typed Tag is created, so a Save below it is not covered', async () => {
    keeps(snack)
    await renderSuspended(host)
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'dinner')
    await user.click(await screen.findByRole('option', { name: /dinner/ }))

    await vi.waitFor(() => expect(picked()).toEqual(['dinner']))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('leaves a name typed while an earlier one was refused where it is', async () => {
    keeps()
    const { handler, release } = held('post', '/api/tags')
    server.use(handler)
    await renderSuspended(host)
    const user = userEvent.setup()
    const field = screen.getByRole('combobox', { name: 'Tags' })

    await user.type(field, tooLong)
    await user.click(await screen.findByRole('option', { name: /a{31}/ }))
    await user.type(field, 'lunch')
    release()

    await screen.findByRole('alert')
    expect(field).toHaveValue('lunch')
  })

  it('holds Save while a failed Tag is retried from its toast, then picks it', async () => {
    toastAdd.mockClear()
    keeps()
    const retried = held('post', '/api/tags')
    server.use(
      // The first create fails for want of a connection; its Retry is held.
      http.post(
        '/api/tags',
        ({ response }) => response(503).json(noConnection),
        {
          once: true,
        },
      ),
      retried.handler,
    )
    await renderSuspended(host)
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'snack')
    await user.click(await screen.findByRole('option', { name: /snack/ }))
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    toastAdd.mock.calls.at(-1)![0].actions[0].onClick()

    const save = screen.getByRole('button', { name: 'Save' })
    await vi.waitFor(() => expect(save).toBeDisabled())
    retried.release()
    await vi.waitFor(() => expect(save).toBeEnabled())
    expect(picked()).toEqual(['snack'])
  })

  it('takes one Tag off when it is picked again from the list, and keeps the other', async () => {
    keeps(breakfast, snack)
    await renderSuspended(hosting([breakfast, snack]))
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'snack' }))

    await vi.waitFor(() => expect(picked()).toEqual(['Breakfast']))
  })

  it('keeps a Tag already picked when its name is typed and entered again', async () => {
    keeps(breakfast)
    await renderSuspended(hosting([breakfast]))
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'Breakfast')
    await screen.findByRole('option', { name: 'Breakfast' })
    await user.keyboard('{Enter}')
    await settle()

    expect(picked()).toEqual(['Breakfast'])
  })

  it('takes a Tag off when it is clicked in a list narrowed by a typed name', async () => {
    keeps(breakfast)
    await renderSuspended(hosting([breakfast]))
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'Break')
    await user.click(await screen.findByRole('option', { name: 'Breakfast' }))

    await vi.waitFor(() => expect(picked()).toEqual([]))
  })

  it('takes a Tag off from the keyboard when nothing is typed', async () => {
    keeps(breakfast)
    await renderSuspended(hosting([breakfast]))
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await screen.findByRole('option', { name: 'Breakfast' })
    await user.keyboard('{ArrowDown}{Enter}')

    await vi.waitFor(() => expect(picked()).toEqual([]))
  })

  it('takes a Tag off by a click after its name was entered again', async () => {
    keeps(breakfast)
    await renderSuspended(hosting([breakfast]))
    const user = userEvent.setup()
    const field = screen.getByRole('combobox', { name: 'Tags' })

    await user.type(field, 'Breakfast')
    await screen.findByRole('option', { name: 'Breakfast' })
    await user.keyboard('{Enter}')
    await user.type(field, 'Break')
    await user.click(await screen.findByRole('option', { name: 'Breakfast' }))

    await vi.waitFor(() => expect(picked()).toEqual([]))
  })

  it('holds Save until a typed Tag has been created, and a second name typed meanwhile stays', async () => {
    keeps()
    const { handler, release } = held('post', '/api/tags')
    server.use(handler)
    await renderSuspended(hosting([breakfast]))
    const user = userEvent.setup()
    const field = screen.getByRole('combobox', { name: 'Tags' })

    await user.type(field, 'dinner')
    await user.click(await screen.findByRole('option', { name: /dinner/ }))
    const save = screen.getByRole('button', { name: 'Save' })
    await vi.waitFor(() => expect(save).toBeDisabled())
    await user.type(field, 'lunch')

    release()
    await vi.waitFor(() => expect(save).toBeEnabled())
    expect(picked()).toEqual(['Breakfast', 'dinner'])
    expect(field).toHaveValue('lunch')
  })

  it('opens on an empty field, offering nothing until the Tags have loaded', async () => {
    // A Tag is kept, so a read that landed would have something to offer.
    keeps(snack)
    server.use(failingRead('/api/tags'))
    await renderSuspended(host)
    const field = screen.getByRole('combobox', { name: 'Tags' })

    expect(field).toHaveValue('')
    await userEvent.setup().click(field)
    expect(screen.queryAllByRole('option')).toEqual([])
  })

  it('opens with its Tag list shut, so a Save below it is not covered', async () => {
    keeps(breakfast)
    await renderSuspended(host)

    await screen.findByRole('button', { name: 'Save' })
    await settle()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('adds one more Tag picked from the list beside those already held, each once', async () => {
    keeps(breakfast, snack)
    await renderSuspended(hosting([breakfast]))
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'snack' }))

    await vi.waitFor(() => expect(picked()).toEqual(['Breakfast', 'snack']))
  })
})
