import { describe, expect, it } from 'vitest'
import { estimatedEntry, weighedEntry } from '~~/test/entry-fixtures'
import { formatEntryName } from './entry'

describe('formatEntryName', () => {
  it('names a Weighed entry by its food with rounded calories', () => {
    expect(
      formatEntryName(
        weighedEntry({
          id: 1,
          calories: 106.6,
          foodId: 5,
          foodName: 'Banana',
          grams: 120,
        }),
      ),
    ).toBe('Banana — 107 kcal')
  })

  it('names an Estimated entry by its label', () => {
    expect(
      formatEntryName(
        estimatedEntry({ id: 2, calories: 600, label: 'Cafe lunch' }),
      ),
    ).toBe('Cafe lunch — 600 kcal')
  })
})
