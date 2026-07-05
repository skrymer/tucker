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
