import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import { useReferenceFoodMatch } from './useReferenceFoodMatch'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd, remove: vi.fn() }))

let seen: { method: string; body?: Record<string, unknown> } | undefined
registerEndpoint('/api/foods/7/reference-food', {
  method: 'PUT',
  handler: async (event) => {
    seen = { method: 'PUT', body: await readBody(event) }
    return {}
  },
})
registerEndpoint('/api/foods/7/reference-food', {
  method: 'DELETE',
  handler: () => {
    seen = { method: 'DELETE' }
    return {}
  },
})

/** Drive the composable through a host, as the rest of the suite does. */
function host(onChanged: () => void | Promise<void>) {
  const food = ref<{ id: number; name: string } | null>({
    id: 7,
    name: 'Tasty cheese',
  })
  const component = defineComponent({
    setup() {
      const { claim, clear } = useReferenceFoodMatch(food, onChanged)
      return { claim: () => claim(101), clear: () => clear() }
    },
    template: `<div>
      <button @click="claim">claim</button>
      <button @click="clear">clear</button>
    </div>`,
  })
  return { component, food }
}

describe('useReferenceFoodMatch', () => {
  it('claims the borrow for the held Food, then closes it and refreshes', async () => {
    const onChanged = vi.fn()
    const { component, food } = host(onChanged)
    await renderSuspended(component)

    await userEvent.setup().click(screen.getByRole('button', { name: 'claim' }))

    expect(seen).toEqual({ method: 'PUT', body: { referenceFoodId: 101 } })
    // The picker closes on the answer, never optimistically: until the server has
    // said so, the coverage figure behind it is still the old one.
    expect(food.value).toBeNull()
    expect(onChanged).toHaveBeenCalled()
  })

  it('retries against the Food that failed, not whichever is open by then', async () => {
    let failing = true
    seen = undefined
    registerEndpoint('/api/foods/7/reference-food', {
      method: 'PUT',
      handler: async (event) => {
        if (failing) throw createError({ statusCode: 500 })
        seen = { method: 'PUT-7', body: await readBody(event) }
        return {}
      },
    })

    const { component, food } = host(vi.fn())
    await renderSuspended(component)
    await userEvent.setup().click(screen.getByRole('button', { name: 'claim' }))
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())

    // The sheet is closed and reopened on a different Food while the failure's
    // Retry is still on screen (ADR 0005 — it persists so the User need not
    // re-enter the sheet). Retry must replay the match that failed.
    food.value = { id: 9, name: 'Chicken breast' }
    failing = false
    const retry = toastAdd.mock.calls.at(-1)![0].actions[0].onClick
    await retry()

    expect(seen).toEqual({ method: 'PUT-7', body: { referenceFoodId: 101 } })
  })

  it('takes the borrow back for the held Food, then closes it and refreshes', async () => {
    const onChanged = vi.fn()
    const { component, food } = host(onChanged)
    await renderSuspended(component)

    await userEvent.setup().click(screen.getByRole('button', { name: 'clear' }))

    expect(seen).toEqual({ method: 'DELETE' })
    expect(food.value).toBeNull()
    expect(onChanged).toHaveBeenCalled()
  })
})
