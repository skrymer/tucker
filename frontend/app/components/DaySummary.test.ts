import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
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
})
