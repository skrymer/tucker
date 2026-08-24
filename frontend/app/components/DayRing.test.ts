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

  it('reads a day landing exactly on budget as none left, not as over', async () => {
    await renderSuspended(DayRing, {
      props: { ...underBudget, caloriesConsumed: 2140, caloriesRemaining: 0 },
    })

    expect(screen.getByText('kcal left')).toBeVisible()
    expect(screen.queryByText('kcal over')).toBeNull()
  })

  // The arcs are decorative (aria-hidden), so they are read off the SVG — see
  // RingGauge.test.ts. What is pinned here is which arcs the Day Ring asks for:
  // two, calories outside protein, the calorie one turning to the error role
  // once the day is over budget.
  const arcs = (container: Element) =>
    Array.from(container.querySelectorAll('circle')).filter((c) =>
      c.hasAttribute('stroke-dashoffset'),
    )

  it('draws calories outside protein, one arc each', async () => {
    const { container } = await renderSuspended(DayRing, { props: underBudget })

    expect(
      arcs(container).map((c) => [
        c.getAttribute('r'),
        c.getAttribute('stroke'),
      ]),
    ).toEqual([
      ['72', 'var(--ui-primary)'],
      ['52', 'var(--ui-secondary)'],
    ])
  })

  it('turns the calorie arc to the error role once the day is over budget', async () => {
    const { container } = await renderSuspended(DayRing, {
      props: {
        ...underBudget,
        caloriesConsumed: 2500,
        caloriesRemaining: -360,
      },
    })

    expect(arcs(container)[0]!.getAttribute('stroke')).toBe('var(--ui-error)')
    expect(arcs(container)[1]!.getAttribute('stroke')).toBe(
      'var(--ui-secondary)',
    )
  })
})
