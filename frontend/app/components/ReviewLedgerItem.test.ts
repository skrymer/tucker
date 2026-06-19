import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
import { toLedgerRows } from '~/utils/reviewLedger'
import ReviewLedgerItem from './ReviewLedgerItem.vue'

type WeeklyReview = components['schemas']['WeeklyReviewResponse']

function review(overrides: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    id: 1,
    reviewedOn: '2026-06-08',
    trendWeightKg: 84,
    maintenanceKcal: 2350,
    maintenanceBasis: 'ADAPTIVE',
    calorieBudgetKcal: 1850,
    proteinFloorG: 168,
    ...overrides,
  }
}

// A two-review history so the newest row carries a delta and the seed row doesn't.
function rows(
  latest: Partial<WeeklyReview> = {},
  seed: Partial<WeeklyReview> = {},
) {
  return toLedgerRows([
    review({ id: 1, reviewedOn: '2026-06-01', ...seed }),
    review({ id: 2, ...latest }),
  ])
}

describe('ReviewLedgerItem', () => {
  it('shows the date the review ran', async () => {
    const [latest] = rows()
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(screen.getByText('8 Jun 2026')).toBeVisible()
  })

  it('makes the rounded calorie budget the headline figure', async () => {
    const [latest] = rows({ calorieBudgetKcal: 1849.6 })
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(screen.getByText('1850')).toBeVisible()
    expect(screen.getByText(/kcal budget/i)).toBeVisible()
  })

  it('surfaces how the budget changed from the previous review', async () => {
    const [latest] = rows(
      { calorieBudgetKcal: 1850 },
      { calorieBudgetKcal: 1900 },
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
      maintenanceKcal: 2350,
      proteinFloorG: 168,
    })
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(
      screen.getByText(/84\.0 kg trend.*2350 kcal maint.*168 g protein/i),
    ).toBeVisible()
  })

  it('badges an adaptive-basis review as Adaptive', async () => {
    const [latest] = rows({ maintenanceBasis: 'ADAPTIVE' })
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(screen.getByText('Adaptive')).toBeVisible()
    expect(screen.queryByText('Seed')).not.toBeInTheDocument()
  })

  it('badges a formula-seed review as Seed', async () => {
    const [latest] = rows({ maintenanceBasis: 'FORMULA_SEED' })
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(screen.getByText('Seed')).toBeVisible()
    expect(screen.queryByText('Adaptive')).not.toBeInTheDocument()
  })

  it('badges a held review as Held, not Seed', async () => {
    const [latest] = rows({ maintenanceBasis: 'HELD' })
    await renderSuspended(ReviewLedgerItem, { props: { row: latest } })

    expect(screen.getByText('Held')).toBeVisible()
    expect(screen.queryByText('Seed')).not.toBeInTheDocument()
    expect(screen.queryByText('Adaptive')).not.toBeInTheDocument()
  })
})
