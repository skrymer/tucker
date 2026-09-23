import { describe, expect, it } from 'vitest'
import { micronutrientReading } from './micronutrientTiles'
import {
  micronutrientRow,
  unstatedMicronutrientRow,
} from '~~/test/micronutrient-fixtures'

describe('micronutrientReading', () => {
  it('names a nutrient it cannot claim, and builds it no tile', () => {
    const reading = micronutrientReading([
      micronutrientRow({ label: 'Iron', claim: 'CLEARS_REFERENCE' }),
      unstatedMicronutrientRow({
        nutrient: 'VITAMIN_B12',
        label: 'Vitamin B12',
      }),
    ])

    // A shortfall is not published, so it is not drawn: the name carries the
    // absence and the structure carries the epistemic split (ADR 0027).
    expect(reading.unstated).toEqual(['Vitamin B12'])
    expect(reading.groups.flatMap((group) => group.tiles)).toEqual([
      expect.objectContaining({ label: 'Iron' }),
    ])
  })

  it('leads with over-the-limit, and names which published line was crossed', () => {
    const reading = micronutrientReading([
      micronutrientRow({ label: 'Iron', claim: 'CLEARS_REFERENCE' }),
      micronutrientRow({
        nutrient: 'SODIUM',
        label: 'Sodium',
        unit: 'mg',
        amount: 2430,
        readAgainst: { kind: 'SUGGESTED_DIETARY_TARGET', amount: 2000 },
        claim: 'OVER_LIMIT',
      }),
    ])

    // Sodium's line is a Suggested Dietary Target, not an Upper Level — calling a
    // population target a safety threshold is the substitution ADR 0027 refuses.
    expect(reading.groups.map((group) => group.heading)).toEqual([
      'Over the limit',
      'Reached the reference',
    ])
    expect(reading.groups[0]?.tiles).toEqual([
      {
        nutrient: 'SODIUM',
        label: 'Sodium',
        bound: '≥ 2430 mg',
        lineLabel: 'Suggested target',
        line: '2000 mg',
      },
    ])
  })

  it('calls an Upper Level an Upper Level', () => {
    const reading = micronutrientReading([
      micronutrientRow({
        nutrient: 'ZINC',
        label: 'Zinc',
        unit: 'mg',
        amount: 48,
        readAgainst: { kind: 'UPPER_LEVEL', amount: 40 },
        claim: 'OVER_LIMIT',
      }),
    ])

    // The other eighteen nutrients read against an Upper Level, so naming it is
    // the ordinary case rather than sodium's exception.
    expect(reading.groups[0]?.tiles[0]).toMatchObject({
      lineLabel: 'Upper Level',
      line: '40 mg',
    })
  })

  it('gives a nutrient that reached its reference a tile naming what it reached', () => {
    const reading = micronutrientReading([
      micronutrientRow({
        label: 'Iron',
        unit: 'mg',
        amount: 21.4,
        readAgainst: { kind: 'RECOMMENDED', amount: 18 },
        claim: 'CLEARS_REFERENCE',
      }),
    ])

    expect(reading.groups).toEqual([
      {
        claim: 'CLEARS_REFERENCE',
        heading: 'Reached the reference',
        tiles: [
          {
            nutrient: 'IRON',
            label: 'Iron',
            bound: '≥ 21 mg',
            lineLabel: 'Reference',
            line: '18 mg',
          },
        ],
      },
    ])
  })

  it('draws an over-the-limit tile a bound that reads above its line', () => {
    const reading = micronutrientReading([
      micronutrientRow({
        nutrient: 'SODIUM',
        label: 'Sodium',
        unit: 'mg',
        amount: 2000.4,
        readAgainst: { kind: 'SUGGESTED_DIETARY_TARGET', amount: 2000 },
        claim: 'OVER_LIMIT',
      }),
    ])

    // The paired rule is this claim's, and only this claim's.
    expect(reading.groups[0]?.tiles[0]).toMatchObject({
      bound: '≥ 2000.4 mg',
      line: '2000.0 mg',
    })
  })

  it('leaves a nutrient that just cleared its reference reading as a tie', () => {
    const reading = micronutrientReading([
      micronutrientRow({
        nutrient: 'THIAMIN',
        label: 'Thiamin',
        unit: 'mg',
        amount: 1.24,
        readAgainst: { kind: 'RECOMMENDED', amount: 1.2 },
        claim: 'CLEARS_REFERENCE',
      }),
    ])

    // Reaching a reference is not strict, so the pair is left level. Spending a
    // decimal to separate them would say the week did something it did not.
    expect(reading.groups[0]?.tiles[0]).toMatchObject({
      bound: '≥ 1.2 mg',
      line: '1.2 mg',
    })
  })
})
