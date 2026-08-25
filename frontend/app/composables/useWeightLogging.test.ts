import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import { openGate } from '~~/test/async-gate'
import { useWeightLogging } from './useWeightLogging'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd, remove: vi.fn() }))

let postedBody: Record<string, unknown> | undefined
// Module-scoped switches, so every test states the shape it needs rather than
// inheriting whichever one ran before it.
let saveSucceeds = true
let held: Promise<void> | null = null
registerEndpoint('/api/weight', {
  method: 'POST',
  handler: async (event) => {
    postedBody = await readBody(event)
    if (held) await held
    if (!saveSucceeds) throw createError({ statusCode: 500 })
    return {}
  },
})

// Drive the composable through a minimal host so it runs in a real component
// context (matching how the rest of the suite exercises composables). The host
// prints `sheetOpen` so a test can read it without reaching into internals.
const host = (options: Parameters<typeof useWeightLogging>[0]) =>
  defineComponent({
    setup() {
      const { sheetOpen, saving, logWeight } = useWeightLogging(options)
      sheetOpen.value = true
      return {
        sheetOpen,
        saving,
        log: () => logWeight({ date: '2026-06-01', weightKg: 84 }),
      }
    },
    template: `<button @click="log">log</button>
      <p>sheet: {{ sheetOpen }}</p><p>saving: {{ saving }}</p>`,
  })

describe('useWeightLogging', () => {
  it('posts the weight with the client local day as the validation anchor, then runs onSaved', async () => {
    postedBody = undefined
    saveSucceeds = true
    held = null
    const onSaved = vi.fn()
    await renderSuspended(host({ today: '2026-06-03', onSaved }))

    await userEvent.click(screen.getByRole('button', { name: 'log' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce())

    expect(postedBody).toEqual({
      date: '2026-06-01',
      weightKg: 84,
      clientToday: '2026-06-03',
    })
  })

  it('keeps the sheet open until the save lands, then closes it', async () => {
    // The sheet is the confirmation: closing it on submit would claim a reading
    // is stored before the server has said so.
    saveSucceeds = true
    const { gate, release } = openGate()
    held = gate
    await renderSuspended(host({ today: '2026-06-03', onSaved: vi.fn() }))

    await userEvent.click(screen.getByRole('button', { name: 'log' }))
    await vi.waitFor(() =>
      expect(screen.getByText('saving: true')).toBeVisible(),
    )
    expect(screen.getByText('sheet: true')).toBeVisible()

    release()
    await vi.waitFor(() =>
      expect(screen.getByText('sheet: false')).toBeVisible(),
    )
  })

  it('leaves the sheet open when the save fails, naming the weight it could not save', async () => {
    saveSucceeds = false
    held = null
    toastAdd.mockClear()
    await renderSuspended(host({ today: '2026-06-03', onSaved: vi.fn() }))

    await userEvent.click(screen.getByRole('button', { name: 'log' }))

    // Settled — not merely still in flight.
    await vi.waitFor(() =>
      expect(screen.getByText('saving: false')).toBeVisible(),
    )
    expect(postedBody).toBeDefined()
    expect(screen.getByText('sheet: true')).toBeVisible()
    // The failure names this save, not saving in general — the toast is all the
    // user gets, and it competes with every other mutation's.
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not save weight' }),
    )
  })
})
