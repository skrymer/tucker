import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import GoalCard from './GoalCard.vue'

const goal = {
  id: 7,
  startedOn: '2026-05-01',
  startWeightKg: 90.0,
  targetWeightKg: 80.0,
  rateKgPerWeek: 0.5,
  active: true,
  dailyDeficitKcal: 550.0,
}

describe('GoalCard', () => {
  it('shows the goal target, rate, start weight and start date', async () => {
    await renderSuspended(GoalCard, { props: { goal } })

    expect(screen.getByText(/80\.0 kg/)).toBeVisible()
    expect(screen.getByText(/0\.5 kg\/week/)).toBeVisible()
    expect(screen.getByText(/90\.0 kg/)).toBeVisible()
    expect(screen.getByText(/1 May 2026/)).toBeVisible()
  })
})
