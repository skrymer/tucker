import { describe, expect, it, vi } from 'vitest'
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
  proteinRemaining: 50,
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

  it('fills the bars to real progress rather than an indeterminate animation', async () => {
    await renderSuspended(DaySummary, { props: { summary } })

    const [calories, protein] = screen.getAllByRole('progressbar')
    expect(calories).toHaveAttribute('aria-valuenow', '1500')
    expect(protein).toHaveAttribute('aria-valuenow', '90')
  })

  it('caps each bar at its target so an over-target value fills rather than overflows', async () => {
    await renderSuspended(DaySummary, {
      props: {
        summary: {
          ...summary,
          caloriesConsumed: 2300,
          calorieBudget: 2000,
          proteinConsumed: 205,
          proteinFloor: 170,
        },
      },
    })

    const [calories, protein] = screen.getAllByRole('progressbar')
    expect(calories).toHaveAttribute('aria-valuenow', '2000') // capped at the budget
    expect(protein).toHaveAttribute('aria-valuenow', '170') // capped at the floor
  })

  it('shows how many calories are left while under budget', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, caloriesRemaining: 500 } },
    })

    expect(screen.getByText('500 kcal left')).toBeVisible()
  })

  it('shows how many calories are over once past the budget', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, caloriesRemaining: -120 } },
    })

    expect(screen.getByText('120 kcal over')).toBeVisible()
    expect(screen.queryByText(/kcal left/)).not.toBeInTheDocument()
  })

  it('shows how much protein is still to go until the floor is met', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, proteinRemaining: 50 } },
    })

    expect(screen.getByText('50 g to go')).toBeVisible()
  })

  it('reports the floor met once protein reaches it', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, proteinRemaining: 0 } },
    })

    expect(screen.getByText('floor met')).toBeVisible()
    expect(screen.queryByText(/g to go/)).not.toBeInTheDocument()
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

  it('offers a delete control on entries revealed by Show all', async () => {
    await renderSuspended(DaySummary, { props: { summary: fiveEntries } })
    const user = userEvent.setup()

    // Hidden behind the cap until expanded — no delete control yet.
    expect(
      screen.queryByRole('button', { name: 'Delete Breakfast — 100 kcal' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /show all 5/i }))

    expect(
      screen.getByRole('button', { name: 'Delete Breakfast — 100 kcal' }),
    ).toBeVisible()
  })

  it('lists each entry with its name and calories', async () => {
    await renderSuspended(DaySummary, { props: { summary: withEntries } })

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Banana — 107 kcal')).toBeVisible()
    expect(screen.getByText('Cafe lunch — 600 kcal')).toBeVisible()
    // At or below the cap, the whole ledger shows — no expander.
    expect(
      screen.queryByRole('button', { name: /show all/i }),
    ).not.toBeInTheDocument()
  })

  it('offers a delete control naming each Weighed and Estimated entry', async () => {
    await renderSuspended(DaySummary, { props: { summary: withEntries } })

    expect(
      screen.getByRole('button', { name: 'Delete Banana — 107 kcal' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Delete Cafe lunch — 600 kcal' }),
    ).toBeVisible()
  })

  it('emits delete with the entry when its delete control is activated', async () => {
    const onDelete = vi.fn()
    await renderSuspended(DaySummary, {
      props: { summary: withEntries, onDelete },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Delete Banana — 107 kcal' }))

    expect(onDelete).toHaveBeenCalledWith(withEntries.entries[0])
  })
})
