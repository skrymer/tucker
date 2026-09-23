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

  it('names each legend row', async () => {
    await renderSuspended(DayRing, { props: underBudget })

    expect(screen.getByText('Calories')).toBeVisible()
    expect(screen.getByText('Protein')).toBeVisible()
  })

  it('names each meter for what it measures, not for its percentage', async () => {
    await renderSuspended(DayRing, { props: underBudget })

    // Asserted through the accessible name rather than the `aria-label`
    // attribute: Nuxt UI drops that on a root div with no role, while the
    // element carrying `role="progressbar"` is named by its own percentage — so
    // a screen reader met two bars called "47%" and "46%" with nothing saying
    // which was which.
    const [calories, protein] = screen.getAllByRole('progressbar')
    expect(calories).toHaveAccessibleName('Calories against the Calorie Budget')
    expect(protein).toHaveAccessibleName('Protein against the Protein Floor')
    // The value is still the value, and is where the percentage belongs.
    expect(calories).toHaveAttribute('aria-valuenow', '1004')
    expect(calories).toHaveAttribute('aria-valuemax', '2140')
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

  // The swatch is what keys a legend row to its arc, and it is a bare decorative
  // span — so, like the arcs themselves, the alternative to reading the class is
  // leaving it unasserted, and a legend keyed to nothing ships green.
  const swatches = (container: Element) =>
    Array.from(container.querySelectorAll('span.size-2\\.5')).map(
      (s) => s.className,
    )

  it('keys each legend row to the colour of its own arc', async () => {
    const { container } = await renderSuspended(DayRing, { props: underBudget })

    expect(swatches(container)[0]).toContain('bg-primary')
    expect(swatches(container)[1]).toContain('bg-secondary')
  })

  it('turns the calorie swatch to the error role alongside its arc', async () => {
    const { container } = await renderSuspended(DayRing, {
      props: {
        ...underBudget,
        caloriesConsumed: 2500,
        caloriesRemaining: -360,
      },
    })

    expect(swatches(container)[0]).toContain('bg-error')
    expect(swatches(container)[1]).toContain('bg-secondary')
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
