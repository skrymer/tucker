import type { components } from '#open-fetch-schemas/api'

/** The windows an Intake Breakdown is offered over (CONTEXT.md — Intake Breakdown). */
export type BreakdownPeriod = 'today' | 'week'

/** How many days each period covers, counted inclusively. */
const PERIOD_DAYS: Record<BreakdownPeriod, number> = { today: 1, week: 7 }

/**
 * The window a period asks about, ending on the user's local today (ADR 0014).
 *
 * Resolved at call time rather than once at setup: a page left open over midnight
 * whose Retry is tapped at 00:03 must ask about the day it is now.
 */
export function breakdownWindow(period: BreakdownPeriod): {
  from: string
  to: string
} {
  // The clock is read once: two reads either side of midnight would hand back a
  // window a day wider than the period asks for.
  const to = localToday()
  return { from: localDaysAgo(PERIOD_DAYS[period] - 1, to), to }
}

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
  /** The Foods it folded, in the backend's ranking — what the expander reveals. */
  items: BreakdownItem[]
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
            items: tail,
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

/**
 * One row of the legend beside the ring — the ring's accessible equivalent, and
 * where a folded row's figures come from when Other is opened.
 */
export interface LegendRow {
  key: string
  /**
   * `slice` is drawn on the ring, `other` is the fold itself, and `folded` is one
   * of the Foods inside it.
   */
  kind: 'slice' | 'other' | 'folded'
  name: string
  /** How many Foods the row stands for. Only `other` stands for more than one. */
  count?: number
  calories: number
  protein: number | null | undefined
  share: number
  isEstimate?: boolean
  /** Absent on a `folded` row, which is on no arc and so is given no hue. */
  color?: string
}

export interface IntakeLegend {
  /** What the ring draws: the ringed Foods, and Other when the tail folded. */
  slices: LegendRow[]
  /** What Other holds, ready to be revealed — no second request (ADR 0026). */
  folded: LegendRow[]
}

/** Lay a ranked breakdown out as legend rows, folding the tail past the palette. */
export function intakeLegend(items: BreakdownItem[]): IntakeLegend {
  const { ringItems, other } = foldTail(items)
  const ringed = ringItems.map((item, i) =>
    rowOf(item, `slot-${i}`, 'slice', RING_SLOT_COLORS[i]!),
  )
  if (!other) return { slices: ringed, folded: [] }
  return {
    slices: [
      ...ringed,
      {
        key: 'other',
        kind: 'other',
        name: 'Other',
        count: other.items.length,
        calories: other.calories,
        protein: other.protein,
        share: other.share,
        // Deliberately unflagged: Other stands for several Foods at once, so an
        // "est." on it would say something about all of them.
        color: OTHER_COLOR,
      },
    ],
    folded: other.items.map((item, i) => rowOf(item, `folded-${i}`, 'folded')),
  }
}

function rowOf(
  item: BreakdownItem,
  key: string,
  kind: LegendRow['kind'],
  color?: string,
): LegendRow {
  return {
    key,
    kind,
    color,
    name: item.name,
    calories: item.calories,
    protein: item.protein,
    share: item.share,
    isEstimate: item.isEstimate,
  }
}
