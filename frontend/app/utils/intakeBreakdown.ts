import type { components } from '#open-fetch-schemas/api'

/** One slice of an Intake Breakdown as the backend ranked it. */
export type BreakdownItem = components['schemas']['IntakeBreakdownItemResponse']

/**
 * The categorical palette's validated hues (frontend/DESIGN.md), in slot order.
 * Slots are assigned in this order and never cycled.
 */
export const RING_SLOT_COLORS = [
  'var(--tucker-cat-1)',
  'var(--tucker-cat-2)',
  'var(--tucker-cat-3)',
  'var(--tucker-cat-4)',
  'var(--tucker-cat-5)',
  'var(--tucker-cat-6)',
  'var(--tucker-cat-7)',
  'var(--tucker-cat-8)',
] as const

/** Other's de-emphasis grey — not a ninth slot. */
export const OTHER_COLOR = 'var(--tucker-cat-other)'

/** How many slices reach the ring: how many hues the palette has, and no more. */
export const RING_SLOTS = RING_SLOT_COLORS.length

/** The folded tail, as one slice. */
export interface OtherSlice {
  count: number
  calories: number
  /** Summed across the tail; null unless every Food in it carried a figure. */
  protein: number | null
  share: number
}

export interface FoldedBreakdown {
  ringItems: BreakdownItem[]
  /** Null when the whole breakdown fits the palette. */
  other: OtherSlice | null
}

/**
 * Fold everything past the palette's last hue into one Other slice. The cap is a
 * fact about the chart, not about the domain, which is why the backend ranks and
 * the client folds (ADR 0026).
 */
export function foldTail(items: BreakdownItem[]): FoldedBreakdown {
  const ringItems = items.slice(0, RING_SLOTS)
  const tail = items.slice(RING_SLOTS)
  return {
    ringItems,
    other:
      tail.length > 0
        ? {
            count: tail.length,
            calories: sum(tail, (i) => i.calories),
            protein: knownProtein(tail),
            share: sum(tail, (i) => i.share),
          }
        : null,
  }
}

function sum(
  items: BreakdownItem[],
  of: (item: BreakdownItem) => number,
): number {
  return items.reduce((total, item) => total + of(item), 0)
}

/**
 * The tail's protein, or null unless every Food in it carried a figure.
 *
 * Stricter than a single slice, and deliberately: a slice merges Entries of one
 * Food, where summing what is known understates the same thing. Other merges
 * *different* Foods, so one unmeasured estimate among several weighed ones would
 * put a confident figure against a row whose calories are mostly unmeasured — and
 * Other is never flagged an estimate, so nothing on screen would hint at it.
 * Omitted rather than understated is the rule the entry rows already follow
 * (ADR 0026).
 */
function knownProtein(items: BreakdownItem[]): number | null {
  if (items.some((item) => item.protein == null)) return null
  return sum(items, (i) => i.protein!)
}
