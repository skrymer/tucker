import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
import GoalGlanceTile from './GoalGlanceTile.vue'

type GoalProgress = components['schemas']['GoalProgressResponse']

const progress: GoalProgress = {
  startWeightKg: 90,
  targetWeightKg: 80,
  currentTrendKg: 86,
  kgToGo: 6,
  percentComplete: 40,
  plannedFinishDate: '2026-08-26',
  plannedRateKgPerWeek: 0.5,
  paceStatus: null,
  observedRateKgPerWeek: null,
  observedFinishDate: null,
}

describe('GoalGlanceTile', () => {
  it('shows percent complete as the hero figure', async () => {
    await renderSuspended(GoalGlanceTile, { props: { progress } })

    expect(screen.getByText('40%')).toBeVisible()
  })

  it('shows how many kilograms are left to go', async () => {
    await renderSuspended(GoalGlanceTile, { props: { progress } })

    expect(screen.getByText('6.0 kg to go')).toBeVisible()
  })

  it('shows the pace badge once the observed pace is available', async () => {
    await renderSuspended(GoalGlanceTile, {
      props: { progress: { ...progress, paceStatus: 'on-pace' } },
    })

    expect(screen.getByText('On pace')).toBeVisible()
  })

  it('omits the pace badge while the pace is still withheld', async () => {
    // The default fixture has paceStatus null (under two weeks of weigh-ins).
    await renderSuspended(GoalGlanceTile, { props: { progress } })

    expect(screen.queryByText(/on pace|behind|ahead|stalled/i)).toBeNull()
  })

  it('makes the whole tile a link through to the weekly review', async () => {
    await renderSuspended(GoalGlanceTile, { props: { progress } })

    expect(screen.getByRole('link')).toHaveAttribute('href', '/review')
  })

  it('shows a Set a goal call to action when there is no active goal', async () => {
    await renderSuspended(GoalGlanceTile, { props: { progress: null } })

    expect(screen.getByRole('link', { name: /set a goal/i })).toHaveAttribute(
      'href',
      '/profile',
    )
    expect(screen.queryByText(/kg to go/i)).not.toBeInTheDocument()
  })
})
