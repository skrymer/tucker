const HUE = 'var(--tucker-cat-1)'

/** The endpoint dot plot's two marks, drawn once on each row and once in its legend. */
export const DUMBBELL_MARKS = {
  p50: { r: 4.5, fill: 'var(--ui-bg)', stroke: HUE },
  p95: { r: 5.5, fill: HUE, stroke: 'none' },
} as const

/** The stem joining the two marks, a tint of their hue. */
export const DUMBBELL_STEM = `color-mix(in oklab, ${HUE} 40%, var(--ui-bg))`
