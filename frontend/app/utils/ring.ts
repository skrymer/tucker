/** One arc of a ring: how much of [target] is filled, and in what colour. */
export interface RingArc {
  /** Radius within the shared 176 viewBox — 72 for an outer arc, 52 for an inner one. */
  radius: number
  /** The filled sweep's colour, a `--ui-*` token reference. */
  stroke: string
  consumed: number
  target: number
}

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

/** The circumference of a ring arc of [radius]. */
export function ringCircumference(radius: number): number {
  return 2 * Math.PI * radius
}

/**
 * The faint track a ring arc is drawn over — a tint of the arc's *own* colour,
 * so re-skinning a role, or an arc flipping to error, never leaves the track on
 * a stale hue.
 */
export function ringTrack(stroke: string): string {
  return `color-mix(in srgb, ${stroke} 15%, transparent)`
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
  return ringCircumference(radius) * (1 - ringFraction(consumed, target))
}
