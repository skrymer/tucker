import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { screen } from '@testing-library/vue'
import { goalProgress } from '~~/test/goal-fixtures'
import { defineComponent, h, ref } from 'vue'
import Today from './index.vue'

// jsdom reports the desktop breakpoint, so a phone-only branch needs saying.
const viewport = vi.hoisted(() => ({ desktop: true }))
mockNuxtImport('useIsDesktop', () => () => ref(viewport.desktop))

// The real composable, seeded through its own public `readFrom` from a host —
// ADR 0013 mocks only the true external boundary, and this one is Tucker's.
// `/` never loads the setting itself; the app shell does, before the page paints.
const tracking = { tracksCalories: true }
const todayFor = (tracksCalories: boolean) =>
  defineComponent({
    setup: () => useCalorieTracking().readFrom({ tracksCalories }),
    render: () => h(Today),
  })
const renderToday = () => renderSuspended(todayFor(tracking.tracksCalories))

const DAY = {
  date: '2026-08-24',
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

describe('/ with Calorie Tracking off', () => {
  it('offers no way to log an entry', async () => {
    tracking.tracksCalories = false

    await renderToday()

    expect(screen.queryByRole('button', { name: /log entry/i })).toBeNull()
  })

  it('offers no floating action button on a phone either', async () => {
    tracking.tracksCalories = false
    viewport.desktop = false

    await renderToday()

    expect(screen.queryByRole('button', { name: /log entry/i })).toBeNull()
  })

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
      expect(screen.getByText(/a couple more weigh-ins/i)).toBeVisible()
      expect(screen.queryByText('kg to go')).toBeNull()
    },
  )
})

describe('/ with Calorie Tracking on', () => {
  it('keeps the day summary and the log-entry action', async () => {
    await renderToday()

    expect(screen.getByText('1500 / 2000 kcal')).toBeVisible()
    expect(screen.getByRole('button', { name: /log entry/i })).toBeVisible()
  })
})
