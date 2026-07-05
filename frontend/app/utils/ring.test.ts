import { describe, expect, it } from 'vitest'
import { ringFraction } from './ring'

// The Day Ring's arc sweep (frontend/DESIGN.md): the filled fraction of the ring
// is `consumed / target`, clamped to 0..1 so the ring never overshoots.
describe('ringFraction', () => {
  it('fills to the consumed fraction of the target', () => {
    expect(ringFraction(1004, 2140)).toBeCloseTo(0.469, 3)
  })

  it('caps at a full ring when consumed exceeds the target', () => {
    expect(ringFraction(2500, 2140)).toBe(1)
  })

  it('reads as empty when the target is missing or non-positive', () => {
    expect(ringFraction(500, 0)).toBe(0)
  })
})
