import { describe, expect, it } from 'vitest'
import { sortByMeasuredOnDesc } from './weightLog'

describe('sortByMeasuredOnDesc', () => {
  it('orders measurements newest-first regardless of input order', () => {
    const sorted = sortByMeasuredOnDesc([
      { id: 1, measuredOn: '2026-05-20', weightKg: 85.0 },
      { id: 3, measuredOn: '2026-05-28', weightKg: 84.2 },
      { id: 2, measuredOn: '2026-05-24', weightKg: 84.6 },
    ])

    expect(sorted.map((m) => m.measuredOn)).toEqual([
      '2026-05-28',
      '2026-05-24',
      '2026-05-20',
    ])
  })
})
