import { describe, expect, it } from 'vitest'
import { formatName } from './name'

describe('formatName', () => {
  it('capitalises a name typed entirely in lower case', () => {
    expect(formatName('rolled oats')).toBe('Rolled oats')
  })

  it('calms a name shouted in capitals', () => {
    expect(formatName('LIGHT MILK')).toBe('Light milk')
  })

  it('leaves an acronym standing in a name that was not shouted', () => {
    expect(formatName('UHT milk')).toBe('UHT milk')
  })

  it('flattens a name capitalised word by word', () => {
    expect(formatName('Free Range Eggs')).toBe('Free range eggs')
  })

  it('leaves a name that already reads as a sentence alone', () => {
    expect(formatName('Bulla cottage cheese')).toBe('Bulla cottage cheese')
  })

  it('states an already-stated name identically, however odd its shape', () => {
    // Two layers format the Intake Breakdown's legend rows — `intakeLegend`
    // states the name and `FigureRow` states it again — so a rule that moved a
    // name on the second pass would have the ring and its legend disagree.
    for (const name of ['b12 SUPPLEMENT', 'a2 MILK', 'UHT MILK', 'Other']) {
      expect(formatName(formatName(name))).toBe(formatName(name))
    }
    expect(formatName('b12 SUPPLEMENT')).toBe('B12 supplement')
  })

  it('calms a short word that is shouting, rather than reading it as an initialism', () => {
    // `LOW FAT MILK` is the commonest shape on an Australian label, and a length
    // cap alone cannot tell `FAT` from `UHT`. What tells them apart is the
    // company they keep: an initialism stands out against lower-case neighbours,
    // and in a wholly shouted name nothing stands out at all.
    expect(formatName('LOW FAT MILK')).toBe('Low fat milk')
    expect(formatName('NO ADDED SUGAR OAT MILK')).toBe(
      'No added sugar oat milk',
    )
    expect(formatName('RAW EGG WHITES')).toBe('Raw egg whites')
  })

  it('capitalises the first letter, not the first character', () => {
    // Nothing trims a Food name on the way in — `AddFoodForm`'s schema is
    // `min(1)` and the domain asks only that it is not blank — and a name can
    // open on a quote or a bracket, where HTML collapses the space and the row
    // would otherwise render uncapitalised with nothing on screen explaining it.
    expect(formatName('  light milk')).toBe('Light milk')
    expect(formatName('"greek" yoghurt')).toBe('"Greek" yoghurt')
  })

  it('leaves a name that opens on a figure alone', () => {
    // `500g` is one token carrying a unit, not a sentence waiting for a capital,
    // and an Estimated Entry's label is very often written this way.
    expect(formatName('500g rolled oats')).toBe('500g rolled oats')
    expect(formatName('2% milk')).toBe('2% milk')
  })

  it('costs an initialism only where the whole name was shouting', () => {
    // The price of the rule above, stated rather than discovered: nothing in
    // `UHT MILK` marks `UHT` out, so it is calmed with the rest. A dictionary is
    // the only thing that would know better.
    expect(formatName('UHT MILK')).toBe('Uht milk')
    expect(formatName('BCAA powder')).toBe('Bcaa powder')
  })

  it('states an accented name without losing its marks', () => {
    expect(formatName('CRÈME FRAÎCHE')).toBe('Crème fraîche')
    expect(formatName('jalapeño POPPERS')).toBe('Jalapeño poppers')
  })

  it('calms a name where only part of it shouts', () => {
    // The shape an Open Food Facts product name usually arrives in, and the one
    // a whole-string test of "is this shouted" lets through untouched.
    expect(formatName('Coles SMOOTH PEANUT BUTTER')).toBe(
      'Coles smooth peanut butter',
    )
  })
})
