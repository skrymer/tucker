import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import { food } from '~~/test/food-fixtures'
import { foodCatalog } from '~~/test/mocks/handlers/catalog'
import { failingWrite } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { useReferenceFoodMatch } from './useReferenceFoodMatch'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd, remove: vi.fn() }))

const cheddar = { id: 101, name: 'Cheese, cheddar, natural, regular fat' }
const cheese = food({ id: 7, name: 'Tasty cheese' })
const chicken = food({ id: 9, name: 'Chicken breast' })

/** The catalog [cheese] and [chicken] make, with [borrowed] borrowing cheddar. */
const catalogWith = (borrowed: number[] = []) =>
  foodCatalog({
    foods: [cheese, chicken].map((f) =>
      borrowed.includes(f.id)
        ? { ...f, referenceFoodId: cheddar.id, referenceFoodName: cheddar.name }
        : f,
    ),
    referenceFoods: [cheddar],
  })

/**
 * Drive the composable through a host that does what a page does with its
 * refresh: re-reads the catalog and states what each Food borrows.
 */
function host() {
  const held = ref<{ id: number; name: string } | null>({
    id: cheese.id,
    name: cheese.name,
  })
  const component = defineComponent({
    setup() {
      const { $api } = useNuxtApp()
      const borrows = ref<string[]>([])
      const refresh = async () => {
        borrows.value = (await $api('/api/foods')).map(
          (f) => `${f.name} borrows ${f.referenceFoodName ?? 'nothing'}`,
        )
      }
      const { claim, clear } = useReferenceFoodMatch(held, refresh)
      return { claim: () => claim(cheddar.id), clear: () => clear(), borrows }
    },
    template: `<div>
      <button @click="claim">claim</button>
      <button @click="clear">clear</button>
      <ul><li v-for="line in borrows" :key="line">{{ line }}</li></ul>
    </div>`,
  })
  return { component, held }
}

const borrowLines = () =>
  screen.queryAllByRole('listitem').map((line) => line.textContent)

describe('useReferenceFoodMatch', () => {
  it('claims the borrow for the held Food, then closes it and refreshes', async () => {
    server.use(...catalogWith())
    const { component, held } = host()
    await renderSuspended(component)

    await userEvent.setup().click(screen.getByRole('button', { name: 'claim' }))

    await vi.waitFor(() =>
      expect(borrowLines()).toEqual([
        'Chicken breast borrows nothing',
        'Tasty cheese borrows Cheese, cheddar, natural, regular fat',
      ]),
    )
    // The picker closes on the answer, never optimistically: until the server has
    // said so, the coverage figure behind it is still the old one.
    expect(held.value).toBeNull()
  })

  it('retries against the Food that failed, not whichever is open by then', async () => {
    let failing = true
    server.use(
      failingWrite('put', '/api/foods/{id}/reference-food', () => failing),
      ...catalogWith(),
    )

    const { component, held } = host()
    await renderSuspended(component)
    await userEvent.setup().click(screen.getByRole('button', { name: 'claim' }))
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())

    // The title is the whole of what the User is told — the description is the
    // shared connection message — so it has to name the action that was lost
    // (ADR 0005). It also keys the toast's id, so two blank titles would have a
    // failed unmatch replace a live match failure.
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not match this food' }),
    )

    // The sheet is closed and reopened on a different Food while the failure's
    // Retry is still on screen (ADR 0005 — it persists so the User need not
    // re-enter the sheet). Retry must replay the match that failed.
    held.value = { id: chicken.id, name: chicken.name }
    failing = false
    const retry = toastAdd.mock.calls.at(-1)![0].actions[0].onClick
    await retry()

    await vi.waitFor(() =>
      expect(borrowLines()).toEqual([
        'Chicken breast borrows nothing',
        'Tasty cheese borrows Cheese, cheddar, natural, regular fat',
      ]),
    )
  })

  it('takes the borrow back for the held Food, then closes it and refreshes', async () => {
    server.use(...catalogWith([cheese.id, chicken.id]))
    const { component, held } = host()
    await renderSuspended(component)

    await userEvent.setup().click(screen.getByRole('button', { name: 'clear' }))

    await vi.waitFor(() =>
      expect(borrowLines()).toEqual([
        'Chicken breast borrows Cheese, cheddar, natural, regular fat',
        'Tasty cheese borrows nothing',
      ]),
    )
    expect(held.value).toBeNull()
  })
  it('names the unmatch when taking the borrow back fails, and stays on that Food', async () => {
    toastAdd.mockClear()
    server.use(
      failingWrite('delete', '/api/foods/{id}/reference-food'),
      ...catalogWith([cheese.id]),
    )

    const { component, held } = host()
    await renderSuspended(component)
    await userEvent.setup().click(screen.getByRole('button', { name: 'clear' }))

    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not unmatch this food' }),
      ),
    )
    // `settled` never ran, so the sheet is still on the Food whose unmatch was
    // lost — the Retry in that toast has something to go back to (ADR 0005).
    expect(held.value).not.toBeNull()
    expect(borrowLines()).toEqual([])
  })
})
