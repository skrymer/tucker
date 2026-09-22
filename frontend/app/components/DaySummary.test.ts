import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { components } from '#open-fetch-schemas/api'
import { estimatedEntry, weighedEntry } from '~~/test/entry-fixtures'
import DaySummary from './DaySummary.vue'

type DailySummary = components['schemas']['DailySummaryResponse']

const summary: DailySummary = {
  date: '2026-05-22',
  setupComplete: true,
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

  it('says why a held budget did not move, beside the budget it is holding', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, heldReason: 'BELOW_BASAL_RATE' } },
    })

    // States the finding — the log and the scale disagree — rather than accusing the
    // User of under-logging, which the engine cannot know (ADR 0031).
    expect(
      screen.getByText(/Your logged food and your weight do not line up yet/),
    ).toBeVisible()
  })

  it('says nothing rather than crashing on a hold reason it does not know', async () => {
    // The precached shell outlives the backend that serves it, so a newly added
    // reason reaches a client built before it. `/` is Tucker's primary screen: the
    // line must go missing, not take the page with it.
    await renderSuspended(DaySummary, {
      props: {
        summary: { ...summary, heldReason: 'SOMETHING_NEWER' as never },
      },
    })

    expect(screen.getByText('1500 / 2000 kcal')).toBeVisible()
    expect(screen.queryByText(/being held steady/)).not.toBeInTheDocument()
  })

  it('says nothing about a hold when the budget was freshly derived', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, heldReason: null } },
    })

    expect(screen.queryByText(/being held steady/)).not.toBeInTheDocument()
  })

  it('wires the calories remaining into the ring centre', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, caloriesRemaining: 500 } },
    })

    expect(screen.getByText('500')).toBeVisible()
    expect(screen.getByText('kcal left')).toBeVisible()
  })

  it('shows protein consumed against the floor', async () => {
    await renderSuspended(DaySummary, { props: { summary } })

    expect(screen.getByText('90 / 140 g')).toBeVisible()
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
    expect(screen.getByText('90 / 168 g')).toBeVisible()
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
          calorieBudget: null,
          proteinFloor: null,
          caloriesRemaining: null,
          proteinRemaining: null,
          dayStatus: null,
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
      estimatedEntry({ id: 1, calories: 100, label: 'Breakfast' }),
      estimatedEntry({ id: 2, calories: 200, label: 'Morning snack' }),
      estimatedEntry({ id: 3, calories: 300, label: 'Lunch' }),
      estimatedEntry({ id: 4, calories: 400, label: 'Afternoon snack' }),
      estimatedEntry({ id: 5, calories: 500, label: 'Dinner' }),
    ],
  }

  it('offers no Show all when the day is exactly as long as the list shows', async () => {
    await renderSuspended(DaySummary, {
      props: {
        summary: { ...fiveEntries, entries: fiveEntries.entries.slice(-3) },
      },
    })

    // Three fit, so the control would reveal nothing it had hidden.
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(
      screen.queryByRole('button', { name: /show all/i }),
    ).not.toBeInTheDocument()
  })

  it('shows only the three most recent entries with a Show all control', async () => {
    await renderSuspended(DaySummary, { props: { summary: fiveEntries } })

    // Entries arrive oldest-first; the most recent three stay visible.
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Dinner')).toBeVisible()
    expect(screen.getByText('Lunch')).toBeVisible()
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument()
    expect(screen.queryByText('Morning snack')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show all 5/i })).toBeVisible()
  })

  it('reveals every entry when Show all is activated', async () => {
    await renderSuspended(DaySummary, { props: { summary: fiveEntries } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /show all 5/i }))

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('Breakfast')).toBeVisible()
    expect(screen.getByText('Morning snack')).toBeVisible()
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
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show all 5/i })).toBeVisible()
  })

  const withEntries: DailySummary = {
    ...summary,
    entries: [
      weighedEntry({
        id: 1,
        calories: 107,
        protein: 12,
        foodId: 5,
        foodName: 'Banana',
        grams: 120,
      }),
      estimatedEntry({ id: 2, calories: 600, label: 'Cafe lunch' }),
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

  it('lists each entry with its name, calories and protein', async () => {
    await renderSuspended(DaySummary, { props: { summary: withEntries } })

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Banana')).toBeVisible()
    expect(screen.getByText('Cafe lunch')).toBeVisible()
    // At or below the cap, the whole ledger shows — no expander.
    expect(
      screen.queryByRole('button', { name: /show all/i }),
    ).not.toBeInTheDocument()
  })

  it('states an entry as a name over its figures, as every other list does', async () => {
    await renderSuspended(DaySummary, { props: { summary: withEntries } })

    // The Intake Breakdown legend's shape (frontend/DESIGN.md): the Food is what
    // the eye lands on, and what it cost sits under it in quieter type. Both
    // located inside the one row and in that order, or the assertion passes on a
    // page that merely holds the two strings somewhere.
    const [banana] = screen.getAllByRole('listitem')
    expect(banana).toHaveTextContent(/^Banana\s*107 kcal · 12 g protein$/)
  })

  it('offers a delete control naming each Weighed and Estimated entry', async () => {
    await renderSuspended(DaySummary, { props: { summary: withEntries } })

    expect(
      screen.getByRole('button', {
        name: 'Delete Banana — 107 kcal · 12 g protein',
      }),
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

    // Located by prefix: what the button is *named* is pinned by the test above,
    // so this one only has to find it.
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^Delete Banana/ }))

    expect(onDelete).toHaveBeenCalledWith(withEntries.entries[0])
  })
})
