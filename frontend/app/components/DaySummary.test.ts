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
  })
})
