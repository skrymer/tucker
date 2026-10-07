import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { withCalorieTracking } from '~~/test/calorie-tracking-helpers'
import { estimatedEntry, weighedEntry } from '~~/test/entry-fixtures'
import { dailyLogs } from '~~/test/mocks/handlers/entries'
import { weightMeasurements } from '~~/test/mocks/handlers/weight'
import { goalInProgress } from '~~/test/mocks/handlers/goal'
import { summaryOf, type SummaryDay } from '~~/test/mocks/handlers/summary'
import { http, serverError } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { ref, type Ref } from 'vue'
import Today from './index.vue'

// The baseline was last weighed on a day long past, so the weight tile offers
// its create action, and it has no Goal — Maintenance Mode (ADR 0008) is the
// quieter page.

// jsdom reports the desktop breakpoint, so a phone-only branch needs saying.
const viewport = vi.hoisted(() => ({ desktop: true }))
mockNuxtImport('useIsDesktop', () => () => ref(viewport.desktop))

// The day Today shows, held here so a test can turn it over as the clock would.
let localDay: Ref<string>
mockNuxtImport('useLocalDay', () => () => localDay)

const tracking = { tracksCalories: true }
const renderToday = () =>
  renderSuspended(withCalorieTracking(Today, tracking.tracksCalories))

const DAY: SummaryDay = {
  setupComplete: true,
  caloriesConsumed: 1500,
  proteinConsumed: 140,
  estimatedCalorieShare: 0,
  calorieBudget: 2000,
  proteinFloor: 140,
  caloriesRemaining: 500,
  dayStatus: 'on-target',
  trendWeightKg: 86,
  entries: [],
}
/**
 * A day whose Goal rate outran Maintenance: the Budget *is* Maintenance, so the
 * remaining figure has to follow it or the fixture describes a day the backend
 * cannot send.
 */
const suspendedDay = (): SummaryDay => ({
  ...DAY,
  calorieBudget: 1595,
  caloriesRemaining: 95,
  deficitSuspended: true,
})

// A test overriding the day `use()`s its own after this, which wins.
beforeEach(() => {
  localDay = ref(localToday())
  server.use(summaryOf(DAY))
})

// Both switches are module-scoped, so every test restates the shape it needs
// and the defaults are restored even when an assertion throws.
afterEach(() => {
  tracking.tracksCalories = true
  viewport.desktop = true
})

// Logging is its own destination (ADR 0028): Today reads the day. Stated once,
// because the page no longer branches on viewport for it — today.spec.ts's two
// per-project snapshots are what say the phone has no FAB either.
describe('/ never logs an entry', () => {
  it('offers no way to log an entry', async () => {
    await renderToday()

    expect(screen.getByText('1500 / 2000 kcal')).toBeVisible()
    expect(screen.queryByRole('button', { name: /log entry/i })).toBeNull()
  })
})

describe('/ with Calorie Tracking off', () => {
  it('shows no day summary', async () => {
    tracking.tracksCalories = false

    await renderToday()

    // The day did load: what is missing is missing by choice.
    expect(screen.getByRole('heading', { name: 'Maintaining' })).toBeVisible()
    expect(screen.queryByText(/kcal/i)).toBeNull()
    expect(screen.queryByText(/protein/i)).toBeNull()
  })

  it('shows no budget-change banner', async () => {
    tracking.tracksCalories = false
    server.use(
      summaryOf({
        ...DAY,
        budgetChange: {
          reviewId: 9,
          previousBudgetKcal: 1800,
          newBudgetKcal: 2000,
          previousFloorG: 135,
          newFloorG: 140,
        },
      }),
    )

    await renderToday()

    // The banner's own headline and the figures it would print. Not a role
    // query (Nuxt UI's UAlert carries none) and not a page-wide /budget/i — the
    // Maintaining card says "budget" too, so that would pass or fail on which
    // Drift Status the fixture happens to carry.
    expect(screen.getByRole('heading', { name: 'Maintaining' })).toBeVisible()
    expect(screen.queryByText(/your calorie budget has changed/i)).toBeNull()
    expect(screen.queryByText(/1800/)).toBeNull()
    expect(screen.queryByText(/2000/)).toBeNull()
  })

  it('keeps the weight tile and its log action — the one thing left to do', async () => {
    tracking.tracksCalories = false

    await renderToday()

    expect(
      screen.getByRole('heading', { name: /today's weight/i }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /log weight/i })).toBeVisible()
  })
})

describe('/ wherever there is an active Goal', () => {
  it.each([true, false])(
    'shows the goal as a ring with Calorie Tracking %s',
    async (tracksCalories) => {
      tracking.tracksCalories = tracksCalories
      server.use(goalInProgress())

      await renderToday()

      expect(screen.getByText('6.0')).toBeVisible()
      expect(screen.getByText('40% complete')).toBeVisible()
      expect(screen.getByText(/Trend weight/)).toHaveTextContent('86.0 kg')
    },
  )
})

describe("/ when the Goal's rate outruns Maintenance", () => {
  it('explains why no deficit is being applied, beside the budget it explains', async () => {
    server.use(
      goalInProgress({ plannedRateKgPerWeek: 1.5 }),
      summaryOf(suspendedDay()),
    )

    await renderToday()

    const banner = screen.getByText(/No deficit is being applied/i)
    expect(banner).toBeVisible()
    // The sentence ADR 0030 decision 5 rests on: the card states no figure of its
    // own and points at the Budget below, which is what makes naming one wrong.
    expect(
      screen.getByText(/calorie budget below is your full maintenance/i),
    ).toBeVisible()
    // Off the summary alone: it must not be gated on a second read that could
    // fail while the deficit really is suspended.
    const budget = screen.getByText('1500 / 1595 kcal')
    expect(budget).toBeVisible()
    // "below" is the decision, not a turn of phrase (decision 7) — it explains
    // the Budget, so it precedes the card stating it.
    expect(
      banner.compareDocumentPosition(budget) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('stays out of the way while the deficit is being applied', async () => {
    server.use(goalInProgress(), summaryOf({ ...DAY, deficitSuspended: false }))

    await renderToday()

    expect(screen.queryByText(/No deficit is being applied/i)).toBeNull()
  })

  it('says nothing to a User with Calorie Tracking off', async () => {
    // Its copy points at a calorie budget "below", and with tracking off there
    // is no day summary on the page for it to point at.
    tracking.tracksCalories = false
    server.use(
      goalInProgress({ plannedRateKgPerWeek: 1.5 }),
      summaryOf(suspendedDay()),
    )

    await renderToday()

    expect(screen.getByText('40% complete')).toBeVisible()
    expect(screen.queryByText(/No deficit is being applied/i)).toBeNull()
  })
})

describe('/ in Maintenance Mode', () => {
  it.each([true, false])(
    'keeps the Maintaining card and rings nothing with Calorie Tracking %s',
    async (tracksCalories) => {
      tracking.tracksCalories = tracksCalories

      await renderToday()

      // Maintenance Mode is the absence of a Goal (ADR 0008) — there is nothing
      // to close, so there is no ring to close it with.
      expect(screen.getByRole('heading', { name: 'Maintaining' })).toBeVisible()
      expect(screen.getByText('86.0 kg')).toBeVisible()
      expect(screen.getByText(/a couple more readings/i)).toBeVisible()
      expect(screen.queryByText('kg to go')).toBeNull()
    },
  )
})

describe('/ with Calorie Tracking on', () => {
  it('keeps the day summary', async () => {
    await renderToday()

    expect(screen.getByText('1500 / 2000 kcal')).toBeVisible()
  })
})

const todaysSalmon = weighedEntry({
  id: 1,
  loggedOn: localToday(),
  calories: 312,
  protein: 33,
  foodId: 7,
  foodName: 'Salmon',
  grams: 150,
})
/** Today with one Entry on it, its figures agreeing with that Entry. */
const todayWithSalmon: SummaryDay = {
  ...DAY,
  caloriesConsumed: 312,
  entries: [todaysSalmon],
}

describe("/ with today's Entries", () => {
  it('shows no day list on a day with nothing logged', async () => {
    await renderToday()

    expect(screen.getByText('1500 / 2000 kcal')).toBeVisible()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it("drops a deleted Entry from today's list", async () => {
    let entries = [todaysSalmon]
    server.use(
      summaryOf(() => ({
        ...DAY,
        caloriesConsumed: entries.reduce((sum, e) => sum + e.calories, 0),
        entries,
      })),
      http.delete('/api/entries/{id}', ({ params, response }) => {
        entries = entries.filter((e) => e.id !== Number(params.id))
        return response(204).empty()
      }),
    )
    await renderToday()
    const user = userEvent.setup()

    expect(
      await screen.findByRole('region', { name: /^Today · / }),
    ).toHaveTextContent('1 entry · 312 kcal')
    await user.click(
      screen.getByRole('button', {
        name: 'Delete Salmon — 312 kcal · 33 g protein',
      }),
    )
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    )

    await vi.waitFor(() =>
      expect(screen.queryByRole('region')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('0 / 2000 kcal')).toBeVisible()
  })
})

describe('/ with Entries logged for tomorrow', () => {
  const preppedLunch = estimatedEntry({
    id: 2,
    loggedOn: localTomorrow(),
    calories: 620,
    label: 'Prepped chicken & rice',
  })
  const tomorrowsOats = weighedEntry({
    id: 3,
    loggedOn: localTomorrow(),
    calories: 228,
    protein: 8,
    foodId: 9,
    foodName: 'Rolled oats',
    grams: 60,
  })

  beforeEach(() => {
    server.use(
      summaryOf(todayWithSalmon),
      ...dailyLogs({ [localTomorrow()]: [preppedLunch, tomorrowsOats] }),
    )
  })

  it("lists them in a Tomorrow list below today's, apart from today's", async () => {
    await renderToday()

    const [today, tomorrow] = await screen.findAllByRole('region')
    expect(today).toHaveAccessibleName(/^Today · /)
    expect(within(today!).getByText('1 entry · 312 kcal')).toBeVisible()
    expect(within(today!).queryByText('Rolled oats')).not.toBeInTheDocument()

    expect(tomorrow).toHaveAccessibleName(
      `Tomorrow · ${formatDayHeadingFromISO(localTomorrow())}`,
    )
    expect(within(tomorrow!).getByText('2 entries · 848 kcal')).toBeVisible()
    expect(within(tomorrow!).getByText('Prepped chicken & rice')).toBeVisible()
    expect(within(tomorrow!).getByText('Rolled oats')).toBeVisible()
    expect(within(tomorrow!).queryByText('Salmon')).not.toBeInTheDocument()
  })
  it("drops a deleted Entry from tomorrow's list and leaves today's as it was", async () => {
    await renderToday()
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', {
        name: 'Delete Rolled oats — 228 kcal · 8 g protein',
      }),
    )
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    )

    const tomorrow = screen.getByRole('region', { name: /^Tomorrow · / })
    await vi.waitFor(() =>
      expect(
        within(tomorrow).queryByText('Rolled oats'),
      ).not.toBeInTheDocument(),
    )
    expect(within(tomorrow).getByText('1 entry · 620 kcal')).toBeVisible()
    expect(within(tomorrow).getByText('Prepped chicken & rice')).toBeVisible()
    const today = screen.getByRole('region', { name: /^Today · / })
    expect(within(today).getByText('1 entry · 312 kcal')).toBeVisible()
    expect(within(today).getByText('Salmon')).toBeVisible()
    expect(screen.getByText('312 / 2000 kcal')).toBeVisible()
  })

  it('shows neither list with Calorie Tracking off', async () => {
    tracking.tracksCalories = false
    await renderToday()

    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(screen.queryByText('Rolled oats')).not.toBeInTheDocument()
    expect(screen.queryByText('Salmon')).not.toBeInTheDocument()
  })
})

describe('/ with nothing logged for tomorrow', () => {
  it("shows today's list alone, with no empty Tomorrow card", async () => {
    server.use(summaryOf(todayWithSalmon))
    await renderToday()

    expect(await screen.findByRole('region')).toHaveAccessibleName(/^Today · /)
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(screen.queryByText(/^Tomorrow/)).not.toBeInTheDocument()
  })
})

describe("/ when tomorrow's entries cannot be read", () => {
  it("says so with a Retry, and keeps today's list", async () => {
    server.use(
      summaryOf(todayWithSalmon),
      http.get('/api/entries', ({ response }) =>
        response.untyped(serverError()),
      ),
    )
    await renderToday()

    expect(
      await screen.findByRole('heading', {
        name: "Couldn't load tomorrow's entries",
      }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(screen.getByRole('region', { name: /^Today · / })).toBeVisible()
    expect(screen.getByText('312 / 2000 kcal')).toBeVisible()
  })
})

describe('/ when the day turns over while Today is open', () => {
  it("moves both lists on a day: tomorrow's Entries become today's", async () => {
    const day = localDay.value
    const next = localTomorrow(day)
    const oats = weighedEntry({
      id: 3,
      loggedOn: next,
      calories: 228,
      protein: 8,
      foodId: 9,
      foodName: 'Rolled oats',
      grams: 60,
    })
    server.use(
      http.get('/api/summary', ({ query, response }) => {
        const date = query.get('date')!
        const entries = date === next ? [oats] : [todaysSalmon]
        return response(200).json({
          ...DAY,
          date,
          caloriesConsumed: entries[0]!.calories,
          entries,
        })
      }),
      ...dailyLogs({ [next]: [oats] }),
    )
    await renderToday()
    expect(
      await screen.findByRole('region', { name: /^Tomorrow · / }),
    ).toHaveTextContent('Rolled oats')

    localDay.value = next

    const today = await screen.findByRole('region', {
      name: `Today · ${formatDayHeadingFromISO(next)}`,
    })
    expect(today).toHaveTextContent('Rolled oats')
    expect(today).not.toHaveTextContent('Salmon')
    expect(
      screen.queryByRole('region', { name: /^Tomorrow · / }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('228 / 2000 kcal')).toBeVisible()
  })
  it('never shows the new today as tomorrow while the next day is still being read', async () => {
    const day = localDay.value
    const next = localTomorrow(day)
    const afterNext = localTomorrow(next)
    const oats = weighedEntry({
      id: 3,
      loggedOn: next,
      calories: 228,
      protein: 8,
      foodId: 9,
      foodName: 'Rolled oats',
      grams: 60,
    })
    let release!: () => void
    const nextRead = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('/api/summary', ({ query, response }) => {
        const date = query.get('date')!
        const entries = date === next ? [oats] : [todaysSalmon]
        return response(200).json({
          ...DAY,
          date,
          caloriesConsumed: entries[0]!.calories,
          entries,
        })
      }),
      http.get('/api/entries', async ({ query, response }) => {
        const date = query.get('date')!
        // The day after the new today answers late, as a slow network would.
        if (date === afterNext) await nextRead
        const entries = date === next ? [oats] : []
        return response(200).json({ date, entries, caloriesConsumed: 0 })
      }),
    )
    await renderToday()
    await screen.findByRole('region', { name: /^Tomorrow · / })

    localDay.value = next

    try {
      await screen.findByRole('region', {
        name: `Today · ${formatDayHeadingFromISO(next)}`,
      })
      expect(
        screen.queryByRole('region', { name: /^Tomorrow · / }),
      ).not.toBeInTheDocument()
    } finally {
      release()
    }
  })

  it("stops calling yesterday's reading today's, and logs the next one on the new day", async () => {
    const day = localDay.value
    const next = localTomorrow(day)
    server.use(
      ...weightMeasurements({ id: 1, measuredOn: day, weightKg: 84.2 }),
    )
    await renderToday()
    expect(await screen.findByText('84.2 kg')).toBeVisible()

    localDay.value = next

    expect(await screen.findByText('No weight logged today.')).toBeVisible()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Log weight' }))
    const sheet = await screen.findByRole('dialog', { name: /log weight/i })
    const weight = within(sheet).getByLabelText(/weight \(kg\)/i)
    await user.clear(weight)
    await user.type(weight, '83.9')
    await user.tab()
    await user.click(
      within(sheet).getByRole('button', { name: /save weight/i }),
    )

    // Shown as today's only because it was saved on the new day.
    expect(await screen.findByText('83.9 kg')).toBeVisible()
    expect(
      screen.getByRole('button', { name: "Edit today's weight" }),
    ).toBeVisible()
  })
})
