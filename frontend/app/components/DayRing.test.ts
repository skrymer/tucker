import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import DayRing from './DayRing.vue'

// A day comfortably under budget: 1004 of 2140 kcal, 1136 remaining; 86 of the
// 186 g protein floor. All figures are backend-sourced (ADR 0002).
const underBudget = {
  caloriesConsumed: 1004,
  calorieBudget: 2140,
  caloriesRemaining: 1136,
  proteinConsumed: 86,
  proteinFloor: 186,
}

describe('DayRing', () => {
  it('shows the calories remaining in the centre', async () => {
    await renderSuspended(DayRing, { props: underBudget })

    expect(screen.getByText('1136')).toBeVisible()
    expect(screen.getByText('kcal left')).toBeVisible()
  })

  it('shows the overage with a kcal-over label when over budget', async () => {
    await renderSuspended(DayRing, {
      props: {
        ...underBudget,
        caloriesConsumed: 2500,
        caloriesRemaining: -360,
      },
    })

    expect(screen.getByText('360')).toBeVisible()
    expect(screen.getByText('kcal over')).toBeVisible()
    expect(screen.queryByText('kcal left')).not.toBeInTheDocument()
  })

  it('renders the calories legend as consumed against the budget', async () => {
    await renderSuspended(DayRing, { props: underBudget })

    expect(screen.getByText('1004 / 2140 kcal')).toBeVisible()
  })

  it('renders the protein legend as consumed against the floor', async () => {
    await renderSuspended(DayRing, { props: underBudget })

    expect(screen.getByText('86 / 186 g')).toBeVisible()
  })
})
