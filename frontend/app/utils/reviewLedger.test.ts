import { describe, expect, it } from 'vitest'
import type { components } from '#open-fetch-schemas/api'
import { toLedgerRows } from './reviewLedger'

type WeeklyReview = components['schemas']['WeeklyReviewResponse']

// The history endpoint returns reviews oldest-first; the ledger shows them
// newest-first with each row's delta measured against the older one beneath it.
function review(overrides: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    id: 1,
    reviewedOn: '2026-06-01',
    trendWeightKg: 85,
    maintenanceKcal: 2400,
    calorieBudgetKcal: 1900,
    proteinFloorG: 170,
    note: 'Maintenance basis: ADAPTIVE',
    ...overrides,
  }
}

describe('toLedgerRows', () => {
  it('orders reviews newest-first from an oldest-first history', () => {
    const rows = toLedgerRows([
      review({ id: 1, reviewedOn: '2026-06-01' }),
      review({ id: 2, reviewedOn: '2026-06-08' }),
      review({ id: 3, reviewedOn: '2026-06-15' }),
    ])

    expect(rows.map((r) => r.review.reviewedOn)).toEqual([
      '2026-06-15',
      '2026-06-08',
      '2026-06-01',
    ])
  })

  it('measures each delta against the chronologically previous review', () => {
    const rows = toLedgerRows([
      review({
        id: 1,
        trendWeightKg: 85,
        maintenanceKcal: 2400,
        calorieBudgetKcal: 1900,
        proteinFloorG: 170,
      }),
      review({
        id: 2,
        trendWeightKg: 84,
        maintenanceKcal: 2350,
        calorieBudgetKcal: 1850,
        proteinFloorG: 168,
      }),
    ])

    const latest = rows.find((r) => r.review.id === 2)
    expect(latest?.delta).toEqual({
      trendWeightKg: -1,
      maintenanceKcal: -50,
      calorieBudgetKcal: -50,
      proteinFloorG: -2,
    })
  })

  it('gives the first (seed) review no delta', () => {
    const rows = toLedgerRows([
      review({ id: 1, reviewedOn: '2026-06-01' }),
      review({ id: 2, reviewedOn: '2026-06-08' }),
    ])

    expect(rows.find((r) => r.review.id === 1)?.delta).toBeNull()
  })

  it('reads an adaptive-basis note as an adaptive review', () => {
    const rows = toLedgerRows([review({ note: 'Maintenance basis: ADAPTIVE' })])

    expect(rows[0]?.basis).toBe('adaptive')
  })

  it('reads a held-basis note as a held review', () => {
    const rows = toLedgerRows([review({ note: 'Maintenance basis: HELD' })])

    expect(rows[0]?.basis).toBe('held')
  })

  it('reads a formula-seed note as a seed review', () => {
    const rows = toLedgerRows([
      review({ note: 'Maintenance basis: FORMULA_SEED' }),
    ])

    expect(rows[0]?.basis).toBe('seed')
  })
})
