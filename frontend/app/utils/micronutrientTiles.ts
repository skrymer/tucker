import type { components } from '#open-fetch-schemas/api'

type Row = components['schemas']['MicronutrientRowResponse']
type Claim = Row['claim']

/**
 * One nutrient Tucker can state a figure for: what the window supplied, and the
 * published line that figure was read against.
 *
 * Both figures share one [unit] because they describe the same nutrient — 0.4 µg
 * of iodine and 490 mg of sodium are the same number and nothing else.
 */
export interface MicronutrientTile {
  nutrient: string
  label: string
  unit: string
  amount: number
  againstLabel: string
  againstAmount: number
}

/** The tiles for one claim, under the heading that says which claim it is. */
export interface MicronutrientGroup {
  claim: Claim
  heading: string
  tiles: MicronutrientTile[]
}

/** A window's nutrients split into what Tucker can state and what it cannot. */
export interface MicronutrientReading {
  groups: MicronutrientGroup[]
  unstated: string[]
}

/**
 * Read a window's rows as the two things the screen draws: tiles for the claims
 * Tucker can make, and bare names for the ones it cannot.
 *
 * A data fact rather than a rendering one, so it is decided and tested here
 * rather than inferred from the DOM (ADR 0004; the move `intakeLegend` already
 * makes for the Intake Breakdown's legend).
 */
export function micronutrientReading(rows: Row[]): MicronutrientReading {
  return {
    groups: STATED.map((group) => ({
      claim: group.claim,
      heading: group.heading,
      tiles: rows
        .filter((row) => row.claim === group.claim)
        .map((row) => {
          const against = group.against(row)
          return {
            nutrient: row.nutrient,
            label: row.label,
            unit: row.unit,
            amount: row.amount!,
            againstLabel: against.label,
            againstAmount: against.amount,
          }
        }),
    })).filter((group) => group.tiles.length > 0),
    // Names, never figures — and the wire carries none for these rows anyway.
    // The complement of what is tiled rather than a second test for the one claim
    // that is not: a claim added later then has to be given a heading to appear at
    // all, instead of falling through both halves and vanishing off the card. The
    // partition `MicronutrientIntake.of` makes for the same reason.
    unstated: rows
      .filter((row) => !STATED.some((group) => group.claim === row.claim))
      .map((row) => row.label),
  }
}

/**
 * What each claim Tucker can state is called, and which published line its figure
 * is read against. Over the limit leads, and is usually empty: that claim is the
 * one sound at *any* coverage — more data can only push the figure further over —
 * so it is the finding a barely-matched week can still carry (ADR 0027).
 */
const STATED: { claim: Claim; heading: string; against: (row: Row) => Line }[] =
  [
    {
      claim: 'OVER_LIMIT',
      heading: 'Over the limit',
      against: (row) => ({
        label: LIMIT_NAMES[row.limit!.kind],
        amount: row.limit!.amount,
      }),
    },
    {
      claim: 'CLEARS_REFERENCE',
      heading: 'Reached the reference',
      against: (row) => ({ label: 'Reference', amount: row.recommended! }),
    },
  ]

/**
 * Named for the figure each line actually is. Sodium's is a Suggested Dietary
 * Target rather than an Upper Level, and calling a population chronic-disease
 * target a safety threshold is the substitution ADR 0027 refuses. Keyed off the
 * generated schema, so a rename on the backend fails typecheck here rather than
 * rendering "undefined 2000 mg".
 */
const LIMIT_NAMES: Record<
  components['schemas']['IntakeLimitResponse']['kind'],
  string
> = {
  UPPER_LEVEL: 'Upper Level',
  SUGGESTED_DIETARY_TARGET: 'Suggested target',
}

/** The published line a tile is read against, and what to call it. */
interface Line {
  label: string
  amount: number
}
