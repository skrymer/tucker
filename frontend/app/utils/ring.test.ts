import { describe, expect, it } from 'vitest'
import { ringDashOffset, ringFraction } from './ring'

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

// The SVG dash offset that draws that fraction: a full arc is offset 0 and an
// empty one the whole circumference, so the offset runs opposite to the fill.
describe('ringDashOffset', () => {
  it('leaves no offset when the arc is full', () => {
    expect(ringDashOffset(2140, 2140, 72)).toBe(0)
  })

  it('offsets by the whole circumference when the arc is empty', () => {
    expect(ringDashOffset(0, 2140, 72)).toBeCloseTo(2 * Math.PI * 72, 6)
  })

  it('offsets by the unfilled remainder in between', () => {
    // Half filled leaves half the circumference as offset.
    expect(ringDashOffset(1070, 2140, 52)).toBeCloseTo(Math.PI * 52, 6)
  })
})
