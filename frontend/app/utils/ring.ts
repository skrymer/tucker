/**
 * The filled fraction (0..1) of a Day Ring arc — `consumed / target`, clamped so
 * an over-target day reads as a full ring rather than an overshoot, and a
 * missing or non-positive target reads as empty. Pure presentation for the ring
 * sweep (frontend/DESIGN.md); the day's figures stay backend-sourced.
 */
export function ringFraction(consumed: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(consumed / target, 1)
}

/**
 * The `stroke-dashoffset` that draws [ringFraction] of a circle of [radius]:
 * a full arc is offset 0 and an empty one the whole circumference, so the offset
 * runs opposite to the fill. Owning the inversion here keeps the one place a
 * wrong-direction arc could hide out of every component that draws a ring.
 */
export function ringDashOffset(
  consumed: number,
  target: number,
  radius: number,
): number {
  const circumference = 2 * Math.PI * radius
  return circumference * (1 - ringFraction(consumed, target))
}
