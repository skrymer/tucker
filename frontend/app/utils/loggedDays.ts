/**
 * How far a windowed figure can be trusted: how many of its days were logged.
 *
 * The width of a window is no evidence it was lived in, so a seven-day claim built
 * from three logged days is discounted rather than read at face value (ADR 0026).
 * Null for a single day, whose count can only be none or all — and whose none
 * already reads as "Nothing logged yet" wherever this caption appears.
 *
 * Measured off [from] and [to] rather than off whichever period was asked for, so
 * the caption always describes the figures beside it and never the button last
 * pressed: the two differ for as long as a wider window is still loading.
 */
export function loggedDaysCaption(
  logged: number,
  from: string,
  to: string,
): string | null {
  const days = daysInWindow(from, to)
  return days > 1 ? `${logged} of ${days} days logged` : null
}
