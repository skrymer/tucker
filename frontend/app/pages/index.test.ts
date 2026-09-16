import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { screen } from '@testing-library/vue'
import { goalProgress } from '~~/test/goal-fixtures'
import { withCalorieTracking } from '~~/test/calorie-tracking-helpers'
import { ref } from 'vue'
import Today from './index.vue'

// jsdom reports the desktop breakpoint, so a phone-only branch needs saying.
const viewport = vi.hoisted(() => ({ desktop: true }))
mockNuxtImport('useIsDesktop', () => () => ref(viewport.desktop))

const tracking = { tracksCalories: true }
const renderToday = () =>
  renderSuspended(withCalorieTracking(Today, tracking.tracksCalories))

const DAY = {
  date: '2026-08-24',
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
const suspendedDay = () => ({
  ...DAY,
  calorieBudget: 1595,
  caloriesRemaining: 95,
  deficitSuspended: true,
})

let summary: Record<string, unknown> = DAY
registerEndpoint('/api/summary', () => summary)
// Deliberately not today's date, whatever today is: the tile then offers its
// create action rather than its edit action, and the test does not rot.
registerEndpoint('/api/weight/latest', () => ({
  id: 1,
  measuredOn: '2020-01-01',
  weightKg: 86.2,
}))
// No active Goal by default — Maintenance Mode (ADR 0008) is the quieter page.
let activeGoal: Record<string, unknown> | null = null
registerEndpoint('/api/goal/progress', () => {
  if (activeGoal === null) throw createError({ statusCode: 404 })
  return activeGoal
})

// Both switches are module-scoped, so every test restates the shape it needs
// and the defaults are restored even when an assertion throws.
afterEach(() => {
  tracking.tracksCalories = true
  viewport.desktop = true
  summary = DAY
  activeGoal = null
})

// Logging is its own destination (ADR 0028): Today reads the day. Stated once,
// because the page no longer branches on viewport for it — today.spec.ts's two
// per-project snapshots are what say the phone has no FAB either.
describe('/ never logs an entry', () => {
  it('offers no way to log an entry', async () => {
    await renderToday()

    expect(screen.queryByRole('button', { name: /log entry/i })).toBeNull()
  })
})

describe('/ with Calorie Tracking off', () => {
  it('shows no day summary', async () => {
    tracking.tracksCalories = false

    await renderToday()

    expect(screen.queryByText(/kcal/i)).toBeNull()
    expect(screen.queryByText(/protein/i)).toBeNull()
  })

  it('shows no budget-change banner', async () => {
    tracking.tracksCalories = false
    summary = {
      ...DAY,
      budgetChange: {
        reviewId: 9,
        previousBudgetKcal: 1800,
        newBudgetKcal: 2000,
        previousFloorG: 135,
        newFloorG: 140,
      },
    }

    await renderToday()

    // The banner's own headline and the figures it would print. Not a role
    // query (Nuxt UI's UAlert carries none) and not a page-wide /budget/i — the
    // Maintaining card says "budget" too, so that would pass or fail on which
    // Drift Status the fixture happens to carry.
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
      activeGoal = goalProgress()

      await renderToday()

      expect(screen.getByText('6.0')).toBeVisible()
      expect(screen.getByText('40% complete')).toBeVisible()
      expect(screen.getByText(/Trend weight/)).toHaveTextContent('86.0 kg')
    },
  )
})

describe("/ when the Goal's rate outruns Maintenance", () => {
  it('explains why no deficit is being applied, beside the budget it explains', async () => {
    activeGoal = goalProgress({ plannedRateKgPerWeek: 1.5 })
    summary = suspendedDay()

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
    activeGoal = goalProgress()
    summary = { ...DAY, deficitSuspended: false }

    await renderToday()

    expect(screen.queryByText(/No deficit is being applied/i)).toBeNull()
  })

  it('says nothing to a User with Calorie Tracking off', async () => {
    // Its copy points at a calorie budget "below", and with tracking off there
    // is no day summary on the page for it to point at.
    tracking.tracksCalories = false
    activeGoal = goalProgress({ plannedRateKgPerWeek: 1.5 })
    summary = suspendedDay()

    await renderToday()

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
