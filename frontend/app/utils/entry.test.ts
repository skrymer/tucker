import { describe, expect, it } from 'vitest'
import { estimatedEntry, weighedEntry } from '~~/test/entry-fixtures'
import { formatEntryName } from './entry'

describe('formatEntryName', () => {
  it('names a Weighed entry by its food with rounded calories and protein', () => {
    expect(
      formatEntryName(
        weighedEntry({
          id: 1,
          calories: 106.6,
          protein: 12.4,
          foodId: 5,
          foodName: 'Banana',
          grams: 120,
        }),
      ),
    ).toBe('Banana — 107 kcal · 12 g protein')
  })

  it('names an Estimated entry by its label with its protein', () => {
    expect(
      formatEntryName(
        estimatedEntry({
          id: 2,
          calories: 600,
          protein: 30,
          label: 'Cafe lunch',
        }),
      ),
    ).toBe('Cafe lunch — 600 kcal · 30 g protein')
  })

  it('states a known protein of zero rather than omitting it', () => {
    expect(
      formatEntryName(
        weighedEntry({
          id: 4,
          calories: 135,
          protein: 0,
          foodId: 9,
          foodName: 'Olive oil',
          grams: 15,
        }),
      ),
    ).toBe('Olive oil — 135 kcal · 0 g protein')
  })

  it('omits protein when the entry carries no figure', () => {
    expect(
      formatEntryName(
        estimatedEntry({
          id: 3,
          calories: 600,
          protein: null,
          label: 'Cafe lunch',
        }),
      ),
    ).toBe('Cafe lunch — 600 kcal')
  })
})
