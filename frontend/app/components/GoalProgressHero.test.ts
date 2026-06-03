import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
import GoalProgressHero from './GoalProgressHero.vue'

type GoalProgress = components['schemas']['GoalProgressResponse']

// Under two weeks of weigh-ins: the planned projection is known, the observed
// pace is still withheld.
const withheld: GoalProgress = {
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

const onPace: GoalProgress = {
  ...withheld,
  paceStatus: 'on-pace',
  observedRateKgPerWeek: 0.47,
  observedFinishDate: '2026-10-02',
}

const stalled: GoalProgress = {
  ...withheld,
  paceStatus: 'stalled',
  observedRateKgPerWeek: -0.1,
  observedFinishDate: null,
}

describe('GoalProgressHero', () => {
  it('leads with percent complete and a completion progress bar', async () => {
    await renderSuspended(GoalProgressHero, { props: { progress: withheld } })

    expect(screen.getByText('40%')).toBeVisible()
    expect(screen.getByRole('progressbar')).toBeVisible()
  })

  it('shows the start, current trend, and target weights', async () => {
    await renderSuspended(GoalProgressHero, { props: { progress: withheld } })

    expect(screen.getByText('90.0 kg')).toBeVisible()
    expect(screen.getByText('86.0 kg')).toBeVisible()
    expect(screen.getByText('80.0 kg')).toBeVisible()
  })

  it('shows the planned finish date and rate', async () => {
    await renderSuspended(GoalProgressHero, { props: { progress: withheld } })

    expect(screen.getByText('26 Aug 2026')).toBeVisible()
    expect(screen.getByText(/0\.50 kg\/week/)).toBeVisible()
  })

  it('shows the observed finish date and pace badge once pace is available', async () => {
    await renderSuspended(GoalProgressHero, { props: { progress: onPace } })

    expect(screen.getByText('2 Oct 2026')).toBeVisible()
    expect(screen.getByText('On pace')).toBeVisible()
  })

  it('marks a stalled trend and suppresses its observed finish date', async () => {
    await renderSuspended(GoalProgressHero, { props: { progress: stalled } })

    expect(screen.getByText('Stalled')).toBeVisible()
    // No projection from a non-falling trend, but the plan still stands.
    expect(screen.queryByText('2 Oct 2026')).toBeNull()
    expect(screen.getByText('26 Aug 2026')).toBeVisible()
  })

  it('shows a placeholder for the observed pace until two weeks of weigh-ins', async () => {
    await renderSuspended(GoalProgressHero, { props: { progress: withheld } })

    expect(
      screen.getByText(/pace available after 2 weeks of weigh-ins/i),
    ).toBeVisible()
    // The planned column stays populated while the observed one waits.
    expect(screen.getByText('26 Aug 2026')).toBeVisible()
  })
})
