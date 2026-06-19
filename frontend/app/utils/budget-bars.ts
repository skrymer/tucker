/** A Nuxt UI progress-bar colour token used for the headroom ramp. */
export type BarColor = 'success' | 'warning' | 'error'

/**
 * The Calorie-Budget bar's headroom colour, by the budget *remaining* fraction
 * (`remaining / budget`): green (`success`) with ≥ 25% left, yellow (`warning`)
 * from 10% up to 25%, red (`error`) below 10% or once over budget. Cosmetic
 * presentation only (issue #133) — the day's verdict stays backend-sourced.
 */
export function caloriesBarColor(remaining: number, budget: number): BarColor {
  const fractionLeft = remaining / budget
  if (fractionLeft >= 0.25) return 'success'
  if (fractionLeft >= 0.1) return 'warning'
  return 'error'
}

/**
 * The Protein-Floor bar's headroom colour, by the floor *met* fraction
 * (`consumed / floor`): red (`error`) below 50% met, yellow (`warning`) from 50%
 * up to the full floor, green (`success`) once met (≥ 100%). The reverse of the
 * calorie ramp — a red bar early in the day is an accepted nudge, not a failure.
 */
export function proteinBarColor(consumed: number, floor: number): BarColor {
  const fractionMet = consumed / floor
  if (fractionMet >= 1) return 'success'
  if (fractionMet >= 0.5) return 'warning'
  return 'error'
}
