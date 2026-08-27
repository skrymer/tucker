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
  /** Summed across the tail's known figures; null when none of them carried one. */
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

/** The tail's protein, or null when nothing in it stated any — never a claimed 0 g. */
function knownProtein(items: BreakdownItem[]): number | null {
  const known = items.filter((item) => item.protein != null)
  return known.length > 0 ? sum(known, (i) => i.protein!) : null
}
