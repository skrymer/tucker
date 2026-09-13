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
  return figureAt(amount, decimalsFor(amount), unit)
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

/**
 * Where digits stop earning their place: two significant figures for a trace, and
 * equally the precision past which no reading separates one figure from another,
 * so a margin finer than this is the operator's to carry rather than the digits'.
 */
const MOST_DECIMALS = 4

/**
 * The two figures a tile draws — what the window supplied, stated as a bound, and
 * the published line it was read against.
 *
 * A [strict] claim has to render its pair apart, so the two share the fewest
 * decimals at which the bound still floors above the line — never fewer than either
 * figure's own magnitude precision, so the line is not restated coarser than it was
 * published at. Where no readable precision separates them the operator carries the
 * margin instead: `>` is true of every amount the claim admits.
 *
 * A claim that is not strict reads each figure at its own precision: `≥ 1.2 mg`
 * against a 1.2 mg reference is exactly what clearing a reference means.
 */
export function formatMicronutrientFigures(
  amount: number,
  line: number,
  unit: string,
  strict: boolean,
): { bound: string; line: string } {
  const separating = strict ? separatingDecimals(amount, line) : null
  if (separating === null) {
    return {
      bound: `${strict ? '>' : '≥'} ${formatMicronutrientAmount(amount, unit)}`,
      line: formatMicronutrientAmount(line, unit),
    }
  }
  return {
    bound: `≥ ${figureAt(amount, separating, unit)}`,
    line: figureAt(line, separating, unit),
  }
}

/**
 * The fewest decimals at which the bound still floors above the line, or null
 * where none within a trace's worth of digits does.
 */
function separatingDecimals(amount: number, line: number): number | null {
  for (
    let decimals = Math.max(decimalsFor(amount), decimalsFor(line));
    decimals <= MOST_DECIMALS;
    decimals += 1
  ) {
    if (floorTo(amount, decimals) > floorTo(line, decimals)) return decimals
  }
  return null
}

/**
 * One figure at the precision its caller chose, floored rather than rounded to
 * nearest, so a bound never overstates what the food supports (ADR 0027).
 */
function figureAt(amount: number, decimals: number, unit: string): string {
  return `${floorTo(amount, decimals).toFixed(decimals)} ${unit}`
}

function floorTo(amount: number, decimals: number): number {
  const step = 10 ** decimals
  return Math.floor(amount * step) / step
}
