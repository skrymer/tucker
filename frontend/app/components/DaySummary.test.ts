import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { components } from '#open-fetch-schemas/api'
import DaySummary from './DaySummary.vue'

type DailySummary = components['schemas']['DailySummaryResponse']

const summary: DailySummary = {
  date: '2026-05-22',
  caloriesConsumed: 1500,
  proteinConsumed: 90,
  estimatedCalorieShare: 0,
  calorieBudget: 2000,
  proteinFloor: 140,
  caloriesRemaining: 500,
  dayStatus: 'in-progress',
  entries: [],
}

describe('DaySummary', () => {
  it('shows calories consumed against the budget', async () => {
    await renderSuspended(DaySummary, { props: { summary } })

    expect(screen.getByText('1500 / 2000 kcal')).toBeVisible()
  })

  it('shows protein consumed against the floor', async () => {
    await renderSuspended(DaySummary, { props: { summary } })

    expect(screen.getByText('90 / 140 g protein')).toBeVisible()
  })

  it('rounds the budget and floor from the engine to whole numbers', async () => {
    await renderSuspended(DaySummary, {
      props: {
        summary: {
          ...summary,
          calorieBudget: 1965.7999267578125,
          proteinFloor: 168.39999389648438,
        },
      },
    })

    expect(screen.getByText('1500 / 1966 kcal')).toBeVisible()
    expect(screen.getByText('90 / 168 g protein')).toBeVisible()
  })

  it('shows the day as on target when the summary reports it', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, dayStatus: 'on-target' } },
    })

    expect(screen.getByText('On target')).toBeVisible()
    expect(screen.queryByText('Over budget')).not.toBeInTheDocument()
  })

  it('shows the day as over budget when the summary reports it', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, dayStatus: 'over-budget' } },
    })

    expect(screen.getByText('Over budget')).toBeVisible()
    expect(screen.queryByText('On target')).not.toBeInTheDocument()
  })

  it('shows no verdict while the day is in progress', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, dayStatus: 'in-progress' } },
    })

    expect(screen.queryByText('On target')).not.toBeInTheDocument()
    expect(screen.queryByText('Over budget')).not.toBeInTheDocument()
  })

  it('explains there is no budget before the first weekly review', async () => {
    await renderSuspended(DaySummary, {
      props: {
        summary: {
          ...summary,
          calorieBudget: undefined,
          proteinFloor: undefined,
          caloriesRemaining: undefined,
          dayStatus: undefined,
        },
      },
    })

    expect(screen.getByText(/no budget yet/i)).toBeVisible()
    expect(screen.queryByText('On target')).not.toBeInTheDocument()
    expect(screen.queryByText('Over budget')).not.toBeInTheDocument()
  })

  const fiveEntries: DailySummary = {
    ...summary,
    entries: [
      {
        id: 1,
        loggedOn: '2026-05-22',
        kind: 'ESTIMATED',
        calories: 100,
        isEstimate: true,
        label: 'Breakfast',
      },
      {
        id: 2,
        loggedOn: '2026-05-22',
        kind: 'ESTIMATED',
        calories: 200,
        isEstimate: true,
        label: 'Morning snack',
      },
      {
        id: 3,
        loggedOn: '2026-05-22',
        kind: 'ESTIMATED',
        calories: 300,
        isEstimate: true,
        label: 'Lunch',
      },
      {
        id: 4,
        loggedOn: '2026-05-22',
        kind: 'ESTIMATED',
        calories: 400,
        isEstimate: true,
        label: 'Afternoon snack',
      },
      {
        id: 5,
        loggedOn: '2026-05-22',
        kind: 'ESTIMATED',
        calories: 500,
        isEstimate: true,
        label: 'Dinner',
      },
    ],
  }

  it('shows only the three most recent entries with a Show all control', async () => {
    await renderSuspended(DaySummary, { props: { summary: fiveEntries } })

    // Entries arrive oldest-first; the most recent three stay visible.
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Dinner — 500 kcal')).toBeVisible()
    expect(screen.getByText('Lunch — 300 kcal')).toBeVisible()
    expect(screen.queryByText('Breakfast — 100 kcal')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Morning snack — 200 kcal'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show all 5/i })).toBeVisible()
  })

  it('reveals every entry when Show all is activated', async () => {
    await renderSuspended(DaySummary, { props: { summary: fiveEntries } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /show all 5/i }))

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('Breakfast — 100 kcal')).toBeVisible()
    expect(screen.getByText('Morning snack — 200 kcal')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /show all/i }),
    ).not.toBeInTheDocument()
  })

  it('collapses back to the three most recent when Show less is activated', async () => {
    await renderSuspended(DaySummary, { props: { summary: fiveEntries } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /show all 5/i }))
    await user.click(screen.getByRole('button', { name: /show less/i }))

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText('Breakfast — 100 kcal')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show all 5/i })).toBeVisible()
  })

  it('lists each entry with its name and calories', async () => {
    const withEntries: DailySummary = {
      ...summary,
      entries: [
        {
          id: 1,
          loggedOn: '2026-05-22',
          kind: 'WEIGHED',
          calories: 107,
          isEstimate: false,
          foodId: 5,
          foodName: 'Banana',
          grams: 120,
        },
        {
          id: 2,
          loggedOn: '2026-05-22',
          kind: 'ESTIMATED',
          calories: 600,
          isEstimate: true,
          label: 'Cafe lunch',
        },
      ],
    }
    await renderSuspended(DaySummary, { props: { summary: withEntries } })

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Banana — 107 kcal')).toBeVisible()
    expect(screen.getByText('Cafe lunch — 600 kcal')).toBeVisible()
    // At or below the cap, the whole ledger shows — no expander.
    expect(
      screen.queryByRole('button', { name: /show all/i }),
    ).not.toBeInTheDocument()
  })
})
