import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
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
  onTarget: false,
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

  it('shows the day as on target when the summary reports it', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, onTarget: true } },
    })

    expect(screen.getByText('On target')).toBeVisible()
    expect(screen.queryByText('Off target')).not.toBeInTheDocument()
  })

  it('shows the day as off target when the summary reports it', async () => {
    await renderSuspended(DaySummary, {
      props: { summary: { ...summary, onTarget: false } },
    })

    expect(screen.getByText('Off target')).toBeVisible()
    expect(screen.queryByText('On target')).not.toBeInTheDocument()
  })

  it('explains there is no budget before the first weekly review', async () => {
    await renderSuspended(DaySummary, {
      props: {
        summary: {
          ...summary,
          calorieBudget: undefined,
          proteinFloor: undefined,
          caloriesRemaining: undefined,
          onTarget: undefined,
        },
      },
    })

    expect(screen.getByText(/no budget yet/i)).toBeVisible()
    expect(screen.queryByText('On target')).not.toBeInTheDocument()
    expect(screen.queryByText('Off target')).not.toBeInTheDocument()
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
  })
})
