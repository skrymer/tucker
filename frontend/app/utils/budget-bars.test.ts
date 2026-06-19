import { describe, expect, it } from 'vitest'
import { caloriesBarColor, proteinBarColor } from './budget-bars'

// The calorie bar is a cosmetic headroom cue (issue #133): it ramps
// green → yellow → red as the budget remaining fraction (remaining / budget)
// drops. It is presentation only — the authoritative verdict stays backend-sourced.
describe('caloriesBarColor', () => {
  it('is green when at least a quarter of the budget is left', () => {
    expect(caloriesBarColor(500, 2000)).toBe('success') // 25% left
  })

  it('is yellow when between a tenth and a quarter of the budget is left', () => {
    expect(caloriesBarColor(300, 2000)).toBe('warning') // 15% left
    expect(caloriesBarColor(200, 2000)).toBe('warning') // 10% left (lower edge)
  })

  it('is red when less than a tenth of the budget is left', () => {
    expect(caloriesBarColor(100, 2000)).toBe('error') // 5% left
  })

  it('is red once over budget, when remaining goes negative', () => {
    expect(caloriesBarColor(-50, 2000)).toBe('error')
  })
})

// The Protein-Floor bar is the reverse ramp (issue #133): it fills red → yellow
// → green as the floor *met* fraction (`consumed / floor`) rises. A red bar early
// in the day is an accepted nudge, never a failure signal.
describe('proteinBarColor', () => {
  it('is red when less than half the floor is met', () => {
    expect(proteinBarColor(60, 140)).toBe('error') // ~43% met
  })

  it('is yellow from half the floor up to just under the full floor', () => {
    expect(proteinBarColor(70, 140)).toBe('warning') // 50% met (lower edge)
    expect(proteinBarColor(139, 140)).toBe('warning') // ~99% met
  })

  it('is green once the floor is met or exceeded', () => {
    expect(proteinBarColor(140, 140)).toBe('success') // 100% met
    expect(proteinBarColor(160, 140)).toBe('success') // over the floor
  })
})
