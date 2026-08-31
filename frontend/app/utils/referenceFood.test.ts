import { describe, expect, it } from 'vitest'
import { distinguishingLine } from './referenceFood'

describe('distinguishingLine', () => {
  it('reads the figures out with their units, in the order it was given them', () => {
    expect(
      distinguishingLine([
        { nutrient: 'IODINE', label: 'Iodine', unit: 'µg', amount: 0.4 },
        { nutrient: 'SODIUM', label: 'Sodium', unit: 'mg', amount: 490 },
      ]),
    ).toBe('Iodine 0.4 µg · Sodium 490 mg')
  })
})
