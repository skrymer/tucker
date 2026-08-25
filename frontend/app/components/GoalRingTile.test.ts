import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { goalProgress } from '~~/test/goal-fixtures'
import GoalRingTile from './GoalRingTile.vue'

const progress = goalProgress()

describe('GoalRingTile', () => {
  it('puts the kilograms still to go at the centre of the ring', async () => {
    await renderSuspended(GoalRingTile, { props: { progress } })

    expect(screen.getByText('6.0')).toBeVisible()
    expect(screen.getByText('kg to go')).toBeVisible()
  })

  it('names the goal and how far through it the User is', async () => {
    await renderSuspended(GoalRingTile, { props: { progress } })

    expect(screen.getByRole('heading', { name: 'Goal progress' })).toBeVisible()
    expect(screen.getByText('40% complete')).toBeVisible()
  })

  it('reads the percentage against the trend weight and the target it closes on', async () => {
    await renderSuspended(GoalRingTile, { props: { progress } })

    expect(screen.getByText(/^Trend weight/)).toHaveTextContent(
      'Trend weight 86.0 kg',
    )
    expect(screen.getByText(/^Target/)).toHaveTextContent('Target 80.0 kg')
  })

  it('shows the pace badge once the observed pace is available', async () => {
    await renderSuspended(GoalRingTile, {
      props: { progress: goalProgress({ paceStatus: 'on-pace' }) },
    })

    expect(screen.getByText('On pace')).toBeVisible()
  })

  it('omits the pace badge while the pace is still withheld', async () => {
    // The default fixture has paceStatus null (under two weeks of readings).
    await renderSuspended(GoalRingTile, { props: { progress } })

    expect(screen.queryByText(/on pace|behind|ahead|stalled/i)).toBeNull()
  })

  it('makes the whole card a link through to the weekly review', async () => {
    await renderSuspended(GoalRingTile, { props: { progress } })

    const link = screen.getByRole('link', { name: /goal progress/i })
    expect(link).toHaveAttribute('href', '/review')
  })

  // The arc is decorative (aria-hidden), so it is read off the SVG — see
  // RingGauge.test.ts. What is pinned here is what the Goal ring asks for: one
  // arc, swept to how far through the Goal the User is.
  it('draws one arc, swept to the percentage complete', async () => {
    const { container } = await renderSuspended(GoalRingTile, {
      props: { progress: goalProgress({ percentComplete: 50 }) },
    })

    const arcs = Array.from(container.querySelectorAll('circle')).filter((c) =>
      c.hasAttribute('stroke-dashoffset'),
    )
    expect(arcs).toHaveLength(1)
    expect(arcs[0]!.getAttribute('stroke')).toBe('var(--ui-primary)')
    // Half closed leaves half the circumference as offset.
    expect(Number(arcs[0]!.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      Math.PI * 72,
      6,
    )
  })
})
