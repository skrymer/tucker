import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { openGate } from '~~/test/async-gate'
import { food } from '~~/test/food-fixtures'
import { entryLog } from '~~/test/mocks/handlers/entries'
import { http, serverError } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import { useEstimatedEntryLog, useWeighedEntryLog } from './useEntryLogging'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd, remove: vi.fn() }))

// 80 g of it is 300 kcal and 10 g protein — what the host logs.
const oats = food({
  id: 7,
  name: 'Oats',
  caloriesPer100g: 375,
  proteinPer100g: 12.5,
})

/**
 * Logging against today (or tomorrow), under a Calorie Budget of
 * [calorieBudget]: 120 kcal leaves the host's 300 kcal weighed entry 180 over,
 * 460 leaves its 640 kcal estimate 180 over.
 */
const logEntries = (calorieBudget?: number) =>
  entryLog({
    today: localToday(),
    tomorrow: localTomorrow(),
    foods: [oats],
    calorieBudget,
  })

/** Drive a gate through a minimal host, so it runs in a real component context. */
const host = (onLogged?: () => void) =>
  defineComponent({
    setup() {
      const weighed = useWeighedEntryLog({ onLogged })
      const estimated = useEstimatedEntryLog({ onLogged })
      return {
        weighed,
        estimated,
        logWeighed: () => weighed.log({ foodId: 7, grams: 80, day: 'today' }),
        logWeighedForTomorrow: () =>
          weighed.log({ foodId: 7, grams: 80, day: 'tomorrow' }),
        logEstimated: () =>
          estimated.log({
            label: 'Work canteen',
            calories: 640,
            day: 'today',
          }),
      }
    },
    template: `<button @click="logWeighed">weighed</button>
      <button @click="logWeighedForTomorrow">weighed for tomorrow</button>
      <button @click="logEstimated">estimated</button>
      <button @click="weighed.reset">edit</button>
      <p>warning: {{ weighed.warning.value?.overByKcal ?? 'none' }}</p>
      <p>estimate warning: {{ estimated.warning.value?.overByKcal ?? 'none' }}</p>
      <p>pending: {{ weighed.pending.value }}</p>`,
  })

/** The last toast the User was shown. */
const lastToast = () => toastAdd.mock.calls.at(-1)?.[0]

beforeEach(() => {
  toastAdd.mockClear()
})

describe('useEntryLogging', () => {
  it("stamps today's date on a weighed entry, taking none from its caller", async () => {
    // The handler refuses any other day, which would surface as a failed save.
    // That today is the *local* day, not the UTC one, only the mocked browser
    // can show: Vitest runs in the host's zone (log.spec.ts).
    server.use(...logEntries())
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    expect(lastToast()).toMatchObject({ title: 'Entry logged' })
  })

  it('warns instead of committing when the entry would exceed the Calorie Budget', async () => {
    server.use(...logEntries(120))
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() =>
      expect(screen.getByText('warning: 180')).toBeVisible(),
    )
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('takes the next log as the deliberate "log anyway" and commits', async () => {
    server.use(...logEntries(120))
    await renderSuspended(host())
    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))
    await vi.waitFor(() =>
      expect(screen.getByText('warning: 180')).toBeVisible(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    // Committed, not re-asked: a second preview would warn again, the budget
    // being no less exceeded, and nothing would be logged. The body is rebuilt
    // rather than the one the warning was computed against — which is what
    // keeps the day right across midnight, and today is the only day the
    // handler accepts.
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    expect(lastToast()).toMatchObject({
      title: 'Entry logged',
      description: 'Oats — 80 g · 300 kcal · 10 g protein',
    })
  })

  it('names the Entry in the toast, in the words Today is about to use for it', async () => {
    // The Entry lands on Today, which is never the page that logged it, so the
    // toast is the only sign it worked (ADR 0005).
    server.use(...logEntries())
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    expect(lastToast()).toMatchObject({
      title: 'Entry logged',
      description: 'Oats — 80 g · 300 kcal · 10 g protein',
    })
  })

  it('confirms a weighed entry logged for tomorrow as logged for tomorrow', async () => {
    // The handler takes tomorrow as well as today, and the toast is read off the
    // day the Entry landed on — so one stamped with today says "Entry logged".
    server.use(...logEntries())
    await renderSuspended(host())

    await userEvent.click(
      screen.getByRole('button', { name: 'weighed for tomorrow' }),
    )

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    expect(lastToast()).toMatchObject({
      title: 'Logged for tomorrow',
      description: 'Oats — 80 g · 300 kcal · 10 g protein',
    })
  })

  it('dates a tomorrow Entry by the day of the tap, not the day the page opened', async () => {
    // Only the date is faked, and it keeps ticking, so the render runs as usual.
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 9, 7, 23, 59))
    try {
      // The log knows only the day after midnight: an Entry stamped from the
      // evening before is refused, and the save reported as failed.
      server.use(
        ...entryLog({
          today: '2026-10-08',
          tomorrow: '2026-10-09',
          foods: [oats],
        }),
      )
      await renderSuspended(host())

      vi.setSystemTime(new Date(2026, 9, 8, 0, 1))
      await userEvent.click(
        screen.getByRole('button', { name: 'weighed for tomorrow' }),
      )

      await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
      expect(lastToast()).toMatchObject({ title: 'Logged for tomorrow' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('commits a "log anyway" for tomorrow onto tomorrow', async () => {
    // 120 kcal budget on every day the handler knows: tomorrow's 300 kcal is as
    // far over as today's would be, so the gate warns before committing.
    server.use(...logEntries(120))
    await renderSuspended(host())
    const forTomorrow = screen.getByRole('button', {
      name: 'weighed for tomorrow',
    })
    await userEvent.click(forTomorrow)
    await vi.waitFor(() =>
      expect(screen.getByText('warning: 180')).toBeVisible(),
    )

    await userEvent.click(forTomorrow)

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    expect(lastToast()).toMatchObject({ title: 'Logged for tomorrow' })
  })

  it("logs an estimate the same way, against today's date", async () => {
    server.use(...logEntries())
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'estimated' }))

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    expect(lastToast()).toMatchObject({
      title: 'Entry logged',
      description: 'Work canteen — 640 kcal',
    })
  })

  it('runs onLogged once the Entry is committed, never on the warning', async () => {
    server.use(...logEntries(120))
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
    server.use(...logEntries(120))
    await renderSuspended(host())
    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))
    await vi.waitFor(() =>
      expect(screen.getByText('warning: 180')).toBeVisible(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'edit' }))

    expect(screen.getByText('warning: none')).toBeVisible()
  })

  it('reports pending while the save is in flight, so a form can lock its action', async () => {
    const { gate, release } = openGate()
    // Holds the save open and then falls through to the log, which answers it.
    server.use(
      http.post('/api/entries/weighed', async () => {
        await gate
      }),
      ...logEntries(),
    )
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
    server.use(...logEntries(460))
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'estimated' }))

    await vi.waitFor(() =>
      expect(screen.getByText('estimate warning: 180')).toBeVisible(),
    )
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('names the save, not the projection, when the save is what failed', async () => {
    server.use(
      http.post('/api/entries/weighed', ({ response }) =>
        response.untyped(serverError()),
      ),
      ...logEntries(),
    )
    await renderSuspended(host())

    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    expect(lastToast()).toMatchObject({
      title: 'Could not save entry',
      color: 'error',
    })
  })

  it('stays pending through the deliberate "log anyway" commit, which no projection precedes', async () => {
    // The second tap skips the preview, so only the save is in flight — the one
    // window where "either is pending" and "both are" disagree, and the one
    // where a form left unlocked would take a third tap as a second Entry.
    const { gate, release } = openGate()
    server.use(...logEntries(120))
    await renderSuspended(host())
    await userEvent.click(screen.getByRole('button', { name: 'weighed' }))
    await vi.waitFor(() =>
      expect(screen.getByText('warning: 180')).toBeVisible(),
    )

    server.use(
      http.post('/api/entries/weighed', async () => {
        await gate
      }),
    )
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
