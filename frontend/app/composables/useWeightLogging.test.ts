import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref, type Ref } from 'vue'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
import { bodyAndPlan } from '~~/test/mocks/handlers/body'
import { baselineProfile } from '~~/test/mocks/handlers/profile'
import { held, http, serverError } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { useWeightLogging } from './useWeightLogging'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd, remove: vi.fn() }))

type Reading = components['schemas']['WeightMeasurementResponse']

/** A User with no readings yet, whose scale refuses any day but [today]. */
const scale = (today: string) =>
  bodyAndPlan({ profile: baselineProfile, readings: [], today })

// Drive the composable through a minimal host so it runs in a real component
// context (matching how the rest of the suite exercises composables). The host
// prints `sheetOpen` so a test can read it without reaching into internals,
// and once a save lands it reads the readings back, as a page does.
const host = (today: string | Ref<string>) =>
  defineComponent({
    setup() {
      const { $api } = useNuxtApp()
      const readings = ref<Reading[]>([])
      const { sheetOpen, saving, logWeight } = useWeightLogging({
        today,
        onSaved: async () => {
          readings.value = await $api('/api/weight')
        },
      })
      sheetOpen.value = true
      return {
        sheetOpen,
        saving,
        readings,
        log: () => logWeight({ date: '2026-06-01', weightKg: 84 }),
      }
    },
    template: `<button @click="log">log</button>
      <p>sheet: {{ sheetOpen }}</p><p>saving: {{ saving }}</p>
      <ul><li v-for="r in readings" :key="r.id">{{ r.measuredOn }}: {{ r.weightKg }} kg</li></ul>`,
  })

describe('useWeightLogging', () => {
  it('stamps the day it is at save time, not the day the page opened on', async () => {
    // Today stays open across midnight: the anchor must follow the clock, or a
    // morning reading is validated against yesterday.
    const today = ref('2026-06-03')
    server.use(...scale('2026-06-04'))
    await renderSuspended(host(today))

    today.value = '2026-06-04'
    await userEvent.click(screen.getByRole('button', { name: 'log' }))

    expect(await screen.findByRole('listitem')).toHaveTextContent(
      '2026-06-01: 84 kg',
    )
  })

  it('saves the weight stamped with the client local day, then runs onSaved', async () => {
    server.use(...scale('2026-06-03'))
    await renderSuspended(host('2026-06-03'))

    await userEvent.click(screen.getByRole('button', { name: 'log' }))

    expect(await screen.findByRole('listitem')).toHaveTextContent(
      '2026-06-01: 84 kg',
    )
  })

  it('keeps the sheet open until the save lands, then closes it', async () => {
    // The sheet is the confirmation: closing it on submit would claim a reading
    // is stored before the server has said so.
    const save = held('post', '/api/weight')
    server.use(save.handler, ...scale('2026-06-03'))
    await renderSuspended(host('2026-06-03'))

    await userEvent.click(screen.getByRole('button', { name: 'log' }))
    await save.arrived
    await vi.waitFor(() =>
      expect(screen.getByText('saving: true')).toBeVisible(),
    )
    expect(screen.getByText('sheet: true')).toBeVisible()

    save.release()
    await vi.waitFor(() =>
      expect(screen.getByText('sheet: false')).toBeVisible(),
    )
  })

  it('leaves the sheet open when the save fails, naming the weight it could not save', async () => {
    toastAdd.mockClear()
    server.use(
      http.post('/api/weight', ({ response }) =>
        response.untyped(serverError()),
      ),
    )
    await renderSuspended(host('2026-06-03'))

    await userEvent.click(screen.getByRole('button', { name: 'log' }))

    // Settled — not merely still in flight.
    await vi.waitFor(() =>
      expect(screen.getByText('saving: false')).toBeVisible(),
    )
    expect(screen.getByText('sheet: true')).toBeVisible()
    // The failure names this save, not saving in general — the toast is all the
    // user gets, and it competes with every other mutation's.
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not save weight' }),
    )
  })
})
