import { describe, expect, it } from 'vitest'
import { formatEntryName } from './entry'

describe('formatEntryName', () => {
  it('names a Weighed entry by its food with rounded calories', () => {
    expect(
      formatEntryName({
        id: 1,
        loggedOn: '2026-05-22',
        kind: 'WEIGHED',
        calories: 106.6,
        isEstimate: false,
        foodId: 5,
        foodName: 'Banana',
        grams: 120,
      }),
    ).toBe('Banana — 107 kcal')
  })

  it('names an Estimated entry by its label', () => {
    expect(
      formatEntryName({
        id: 2,
        loggedOn: '2026-05-22',
        kind: 'ESTIMATED',
        calories: 600,
        isEstimate: true,
        label: 'Cafe lunch',
      }),
    ).toBe('Cafe lunch — 600 kcal')
  })
})
