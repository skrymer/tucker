import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { openGate } from '~~/test/async-gate'
import { estimatedEntry, weighedEntry } from '~~/test/entry-fixtures'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import { useEstimatedEntryLog, useWeighedEntryLog } from './useEntryLogging'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd, remove: vi.fn() }))

const logged: Record<string, unknown>[] = []
const previewed: Record<string, unknown>[] = []
// Module-scoped switch, so every test states the shape it needs rather than
// inheriting whichever one ran before it.
let overBudget = false
let held: Promise<void> | null = null
let saveFails = false

/** What a log request carries; each arm below reads only the keys its own kind sends. */
type LoggedBody = {
  foodId: number
  grams: number
  label: string
  calories: number
  protein: number | null
}

for (const kind of ['weighed', 'estimated']) {
  registerEndpoint(`/api/entries/${kind}/preview`, {
    method: 'POST',
    handler: async (event) => {
      previewed.push((await readBody(event)) as Record<string, unknown>)
      return {
        wouldExceedBudget: overBudget,
        calorieBudget: 1900,
        overByKcal: overBudget ? 180 : null,
      }
    },
  })
  registerEndpoint(`/api/entries/${kind}`, {
    method: 'POST',
    handler: async (event) => {
      const sent = (await readBody(event)) as LoggedBody
      logged.push(sent)
      if (held) await held
      if (saveFails) throw createError({ statusCode: 500 })
      // The estimated arm echoes what it was sent: its label, calories and
      // protein are the request's, so the toast cannot name an Entry the caller
      // never logged.
      return kind === 'weighed'
        ? weighedEntry({
            id: 1,
            foodId: sent.foodId,
            foodName: 'Oats',
            grams: sent.grams,
            calories: 300,
            protein: 10,
          })
        : estimatedEntry({
            id: 1,
            label: sent.label,
            calories: sent.calories,
            protein: sent.protein ?? null,
          })
    },
  })
}

/** Drive a gate through a minimal host, so it runs in a real component context. */
const host = (onLogged?: () => void) =>
  defineComponent({
    setup() {
      const weighed = useWeighedEntryLog({ onLogged })
      const estimated = useEstimatedEntryLog({ onLogged })
      return {
        weighed,
        estimated,
        logWeighed: () => weighed.log({ foodId: 7, grams: 80 }),
        logEstimated: () =>
          estimated.log({ label: 'Work canteen', calories: 640 }),
      }
    },
    template: `<button @click="logWeighed">weighed</button>
      <button @click="logEstimated">estimated</button>
      <button @click="weighed.reset">edit</button>
      <p>warning: {{ weighed.warning.value?.overByKcal ?? 'none' }}</p>
      <p>estimate warning: {{ estimated.warning.value?.overByKcal ?? 'none' }}</p>
      <p>pending: {{ weighed.pending.value }}</p>`,
  })

function reset() {
  logged.length = 0
  previewed.length = 0
  overBudget = false
  held = null
  saveFails = false
  toastAdd.mockClear()
}

describe('useEntryLogging', () => {
  it('stamps the local day on a weighed entry rather than taking one from a form', async () => {
    reset()
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() => expect(logged).toHaveLength(1))
    expect(logged[0]).toEqual({ date: localToday(), foodId: 7, grams: 80 })
  })

  it('warns instead of committing when the entry would exceed the Calorie Budget', async () => {
    reset()
    overBudget = true
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() =>
      expect(screen.getByText('warning: 180')).toBeVisible(),
    )
    expect(logged).toHaveLength(0)
  })

  it('takes the next log as the deliberate "log anyway" and commits', async () => {
    reset()
    overBudget = true
    await renderSuspended(host())
    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))
    await vi.waitFor(() =>
      expect(screen.getByText('warning: 180')).toBeVisible(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() => expect(logged).toHaveLength(1))
    // The body the second tap commits is rebuilt, not the one the warning was
    // computed against — which is what keeps the day right across midnight.
    expect(logged[0]).toEqual({ date: localToday(), foodId: 7, grams: 80 })
    // One preview, not two: the second tap is the answer to the first, so it
    // must not re-ask a question the User has already been shown.
    expect(previewed).toHaveLength(1)
  })

  it('names the Entry in the toast, in the words Today is about to use for it', async () => {
    // The Entry lands on Today, which is never the page that logged it, so the
    // toast is the only sign it worked (ADR 0005).
    reset()
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    expect(toastAdd.mock.calls.at(-1)![0]).toMatchObject({
      title: 'Entry logged',
      description: 'Oats — 300 kcal · 10 g protein',
    })
  })

  it('logs an estimate the same way, against the same local day', async () => {
    reset()
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'estimated' }))

    await vi.waitFor(() => expect(logged).toHaveLength(1))
    expect(logged[0]).toEqual({
      date: localToday(),
      label: 'Work canteen',
      calories: 640,
    })
  })

  it('runs onLogged once the Entry is committed, never on the warning', async () => {
    reset()
    overBudget = true
    const onLogged = vi.fn()
    await renderSuspended(host(onLogged))

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))
    await vi.waitFor(() =>
      expect(screen.getByText('warning: 180')).toBeVisible(),
    )
    expect(onLogged).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() => expect(onLogged).toHaveBeenCalledOnce())
  })

  it('clears a showing warning when reset, so the next log re-checks the new figures', async () => {
    reset()
    overBudget = true
    await renderSuspended(host())
    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))
    await vi.waitFor(() =>
      expect(screen.getByText('warning: 180')).toBeVisible(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'edit' }))

    expect(screen.getByText('warning: none')).toBeVisible()
  })

  it('reports pending while the save is in flight, so a form can lock its action', async () => {
    reset()
    const { gate, release } = openGate()
    held = gate
    await renderSuspended(host())
    expect(screen.getByText('pending: false')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() =>
      expect(screen.getByText('pending: true')).toBeVisible(),
    )
    release()
    await vi.waitFor(() =>
      expect(screen.getByText('pending: false')).toBeVisible(),
    )
  })

  it('gates an estimate against the budget too, not only a weighed entry', async () => {
    reset()
    overBudget = true
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'estimated' }))

    await vi.waitFor(() =>
      expect(screen.getByText('estimate warning: 180')).toBeVisible(),
    )
    expect(logged).toHaveLength(0)
  })

  it('names the save, not the projection, when the save is what failed', async () => {
    reset()
    saveFails = true
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    expect(toastAdd.mock.calls.at(-1)![0]).toMatchObject({
      title: 'Could not save entry',
      color: 'error',
    })
  })

  it('stays pending through the deliberate "log anyway" commit, which no projection precedes', async () => {
    // The second tap skips the preview, so only the save is in flight — the one
    // window where "either is pending" and "both are" disagree, and the one
    // where a form left unlocked would take a third tap as a second Entry.
    reset()
    overBudget = true
    const { gate, release } = openGate()
    await renderSuspended(host())
    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))
    await vi.waitFor(() =>
      expect(screen.getByText('warning: 180')).toBeVisible(),
    )

    held = gate
    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() =>
      expect(screen.getByText('pending: true')).toBeVisible(),
    )
    release()
    await vi.waitFor(() =>
      expect(screen.getByText('pending: false')).toBeVisible(),
    )
  })
})
