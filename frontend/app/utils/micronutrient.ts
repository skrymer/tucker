/**
 * The window a **Micronutrient Intake** is read over, and the only one there is:
 * micronutrient intake is enormously spiky day to day, so anything shorter is
 * noise wearing a number's clothes (CONTEXT.md). `MicronutrientIntake.of` refuses
 * every other span, so this is the client's half of one rule rather than a
 * preference — which is why it is not the Intake Breakdown's `week` period, a
 * figure a User can change.
 */
export const MICRONUTRIENT_WINDOW_DAYS = 7

/**
 * A micronutrient figure with its unit, as a User reads it.
 *
 * Decimals are chosen by **magnitude, not by unit**, because one set of figures
 * spans 0.004 µg of vitamin D to 3,000 mg of potassium: 0.3 µg of B12 has to read
 * `0.30 µg` and never `0 µg`. A figure that is *known* says the food gave almost
 * none, which is the opposite of saying nothing (ADR 0027).
 */
export function formatMicronutrientAmount(
  amount: number,
  unit: string,
): string {
  const decimals = decimalsFor(amount)
  // Rounded **down**, not to nearest. Every figure here is read as `≥`, so it
  // claims the window supplied at least this much — and rounding up states a
  // bound the food does not support, which is the one direction a lower bound
  // may never move (ADR 0027). Understating it is always sound.
  const step = 10 ** decimals
  return `${(Math.floor(amount * step) / step).toFixed(decimals)} ${unit}`
}

/**
 * Enough decimals that a known figure never renders as zero, capped so a trace
 * does not become a wall of digits — two significant figures, which is what
 * carries a 0.004 through as `0.0040` rather than as `0.00`.
 *
 * One expression rather than a ladder of thresholds beside it: `1 - floor(log10)`
 * already yields 1 over [1, 10) and 0 or less from 10 up, so spelling those two
 * out again would be the same rule written twice, free to disagree with itself.
 * The clamps are what `toFixed` needs, not what the rule says.
 */
function decimalsFor(amount: number): number {
  if (amount <= 0) return 0
  return Math.min(
    MOST_DECIMALS,
    Math.max(0, 1 - Math.floor(Math.log10(amount))),
  )
}

const MOST_DECIMALS = 4
