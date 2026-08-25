import { describe, expect, it } from 'vitest'
import { toLedgerRows } from './reviewLedger'
import { intakeTargets, weeklyReview } from '~~/test/review-fixtures'

// REVIEW_BASIS_BADGE's labels and colours are deliberately unasserted here.
// They are lookup data: a test naming 'Adaptive' or 'primary' pins the token a
// designer is entitled to change, not a rule. What matters — that all three
// bases are distinguishable, and that one map serves both the phone cards and
// the desktop table — is structural, and is what the Record's key type enforces
// at compile time. Mutation testing reports the three colours as survivors for
// this reason; that is the intended verdict, not a gap.

// The history endpoint returns reviews oldest-first; the ledger shows them
// newest-first with each row's delta measured against the older one beneath it.

describe('toLedgerRows', () => {
  it('orders reviews newest-first from an oldest-first history', () => {
    const rows = toLedgerRows([
      weeklyReview({ id: 1, reviewedOn: '2026-06-01' }),
      weeklyReview({ id: 2, reviewedOn: '2026-06-08' }),
      weeklyReview({ id: 3, reviewedOn: '2026-06-15' }),
    ])

    expect(rows.map((r) => r.review.reviewedOn)).toEqual([
      '2026-06-15',
      '2026-06-08',
      '2026-06-01',
    ])
  })

  it('measures each delta against the chronologically previous review', () => {
    const rows = toLedgerRows([
      weeklyReview({
        id: 1,
        trendWeightKg: 85,
        intakeTargets: intakeTargets({
          maintenanceKcal: 2400,
          calorieBudgetKcal: 1900,
          proteinFloorG: 170,
        }),
      }),
      weeklyReview({
        id: 2,
        trendWeightKg: 84,
        intakeTargets: intakeTargets({
          maintenanceKcal: 2350,
          calorieBudgetKcal: 1850,
          proteinFloorG: 168,
        }),
      }),
    ])

    const latest = rows.find((r) => r.review.id === 2)
    expect(latest?.trendDelta).toBe(-1)
    expect(latest?.targetsDelta).toEqual({
      maintenanceKcal: -50,
      calorieBudgetKcal: -50,
      proteinFloorG: -2,
    })
  })

  it('gives the first (seed) review no delta', () => {
    const rows = toLedgerRows([
      weeklyReview({ id: 1, reviewedOn: '2026-06-01' }),
      weeklyReview({ id: 2, reviewedOn: '2026-06-08' }),
    ])

    const first = rows.find((r) => r.review.id === 1)
    expect(first?.trendDelta).toBeNull()
    expect(first?.targetsDelta).toBeNull()
  })

  it('keeps the Trend Weight delta across a Calorie Tracking gap and invents no targets delta', () => {
    const rows = toLedgerRows([
      weeklyReview({ id: 1, trendWeightKg: 85, intakeTargets: null }),
      weeklyReview({ id: 2, trendWeightKg: 84 }),
    ])

    // The trend is continuous — a weight-only week still weighs in — but the
    // Budget was never published that week, so it cannot have moved.
    const resumed = rows.find((r) => r.review.id === 2)
    expect(resumed?.trendDelta).toBe(-1)
    expect(resumed?.targetsDelta).toBeNull()
  })
})
