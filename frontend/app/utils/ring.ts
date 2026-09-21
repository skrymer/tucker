/** One arc of a ring: how much of [target] is filled, and in what colour. */
export interface RingArc {
  /** Radius in viewBox units — `RING_RADIUS_OUTER` or `RING_RADIUS_INNER`. */
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

// Tucker's ring geometry (frontend/DESIGN.md), owned here rather than restated
// per component — which is what makes "the two rings are peers, drawn at the same
// geometry" true by construction: the Day Ring passes two arcs and the Goal ring
// one, and neither can size itself differently. The Check pair draws the same
// numbers without reading them from here — a side-by-side pair at its own size
// rather than nested arcs (DESIGN.md, "The Check pair — peer rings").

/**
 * The drawn width and height, in **rem**. The centre figure is sized in rem too,
 * so the ring has to scale with it — pinned to px, a User who enlarges their text
 * spends the margin that makes a four-digit figure fit and it runs under the arcs
 * again.
 */
export const RING_SIZE_REM = 12
/** The viewBox the arcs are laid out in, in SVG user units — not px. */
export const RING_VIEW_BOX_UNITS = 176
/** Every arc's stroke, in viewBox units, straddling its radius. */
export const RING_STROKE_WIDTH = 15
/** The outer arc both rings draw, in viewBox units. */
export const RING_RADIUS_OUTER = 72
/** The inner arc, drawn only where a ring has a second figure to show. */
export const RING_RADIUS_INNER = 52

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
