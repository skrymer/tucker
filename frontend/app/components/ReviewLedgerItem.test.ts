import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
import { toLedgerRows, type LedgerRow } from '~/utils/reviewLedger'
import { intakeTargets, weeklyReview } from '~~/test/review-fixtures'
import ReviewLedgerItem from './ReviewLedgerItem.vue'

type WeeklyReview = components['schemas']['WeeklyReviewResponse']

function review(overrides: Partial<WeeklyReview> = {}): WeeklyReview {
  return weeklyReview({
    reviewedOn: '2026-06-08',
    trendWeightKg: 84,
    intakeTargets: intakeTargets({
      maintenanceKcal: 2350,
      calorieBudgetKcal: 1850,
      proteinFloorG: 168,
    }),
    ...overrides,
  })
}

// A two-review history so the newest row carries a delta and the seed row doesn't.
function rows(
  latest: Partial<WeeklyReview> = {},
  seed: Partial<WeeklyReview> = {},
): [LedgerRow, LedgerRow] {
  // toLedgerRows emits one row per review, so a two-review history is always a
  // pair — stated as a tuple here so each test can take a row without having to
  // re-establish that at every call site.
  return toLedgerRows([
    review({ id: 1, reviewedOn: '2026-06-01', ...seed }),
    review({ id: 2, ...latest }),
  ]) as [LedgerRow, LedgerRow]
}

describe('ReviewLedgerItem', () => {
  it('shows the date the review ran', async () => {
    const [latest] = rows()
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(screen.getByText('8 Jun 2026')).toBeVisible()
  })

  it('makes the rounded calorie budget the headline figure', async () => {
    const [latest] = rows({
      intakeTargets: intakeTargets({ calorieBudgetKcal: 1849.6 }),
    })
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(screen.getByText('1850')).toBeVisible()
    expect(screen.getByText(/kcal budget/i)).toBeVisible()
  })

  it('surfaces how the budget changed from the previous review', async () => {
    const [latest] = rows(
      { intakeTargets: intakeTargets({ calorieBudgetKcal: 1850 }) },
      { intakeTargets: intakeTargets({ calorieBudgetKcal: 1900 }) },
    )
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(
      screen.getByText(/down by 50 versus the previous review/i),
    ).toBeInTheDocument()
  })

  it('shows no delta on the seed review, which has no previous to compare', async () => {
    const seed = rows()[1]
    await renderSuspended(ReviewLedgerItem, { props: { row: seed! } })

    expect(
      screen.queryByText(/versus the previous review/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('collapses trend weight, maintenance and protein floor into one line', async () => {
    const [latest] = rows({
      trendWeightKg: 84,
      intakeTargets: intakeTargets({
        maintenanceKcal: 2350,
        proteinFloorG: 168,
      }),
    })
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(
      screen.getByText(/84\.0 kg trend.*2350 kcal maint.*168 g protein/i),
    ).toBeVisible()
  })

  it('badges an adaptive-basis review as Adaptive', async () => {
    const [latest] = rows({
      intakeTargets: intakeTargets({ maintenanceBasis: 'ADAPTIVE' }),
    })
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(screen.getByText('Adaptive')).toBeVisible()
    expect(screen.queryByText('Seed')).not.toBeInTheDocument()
  })

  it('badges a formula-seed review as Seed', async () => {
    const [latest] = rows({
      intakeTargets: intakeTargets({ maintenanceBasis: 'FORMULA_SEED' }),
    })
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(screen.getByText('Seed')).toBeVisible()
    expect(screen.queryByText('Adaptive')).not.toBeInTheDocument()
  })

  it('badges a held review as Held, not Seed', async () => {
    const [latest] = rows({
      intakeTargets: intakeTargets({ maintenanceBasis: 'HELD' }),
    })
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(screen.getByText('Held')).toBeVisible()
    expect(screen.queryByText('Seed')).not.toBeInTheDocument()
    expect(screen.queryByText('Adaptive')).not.toBeInTheDocument()
  })

  it('leads a review run with Calorie Tracking off with the Trend Weight', async () => {
    const [latest] = rows(
      { trendWeightKg: 84, intakeTargets: null },
      { trendWeightKg: 85, intakeTargets: null },
    )
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    // The review's other job is all this week has, so the Trend Weight takes the
    // headline and carries its own week-over-week change.
    expect(screen.getByText('84.0')).toBeVisible()
    expect(screen.getByText(/kg trend/i)).toBeVisible()
    expect(
      screen.getByText(/down by 1\.0 versus the previous review/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/kcal budget/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/kcal maint/i)).not.toBeInTheDocument()
  })

  it('badges no basis on a review run with Calorie Tracking off', async () => {
    const [latest] = rows({ intakeTargets: null }, { intakeTargets: null })
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    // There is no Maintenance, so there is nothing for a basis to be the basis of.
    expect(screen.queryByText('Adaptive')).not.toBeInTheDocument()
    expect(screen.queryByText('Held')).not.toBeInTheDocument()
    expect(screen.queryByText('Seed')).not.toBeInTheDocument()
    // And nothing in its place: an em-dash belongs in a table cell that must keep
    // its column, not on a card that simply has one fewer thing to say.
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })
})
