/**
 * How a number field renders a figure: `Intl.NumberFormat`'s defaults, which
 * none of our fields override — so it stops at three decimals.
 */
const displayed = new Intl.NumberFormat()

/**
 * True when two figures are the same as far as the field can show them.
 *
 * A number field re-reads its own display on every blur and re-emits the
 * result, and that display has been rounded — so a value carrying more
 * precision than the field can show (a provider macro, or a floating point sum
 * like `100.1 + 200.2`) comes back subtly different from the one the field was
 * given. Compared raw, a bare tab-through therefore reads as an edit.
 *
 * The question goes through the same formatter the field renders with, because
 * that is what "as far as the field can show them" means. Scaling by a power of
 * ten and rounding is a *different* rounding: `65.0255 * 1000` is
 * `65025.49999999999`, which breaks down, while the `65.026` the field shows
 * and hands back breaks up — leaving the two disagreeing over a figure the user
 * only ever saw one of.
 */
export function isSameToDisplayedPrecision(a?: number, b?: number): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return displayed.format(a) === displayed.format(b)
}
