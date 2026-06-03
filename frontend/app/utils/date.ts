/**
 * The user's local calendar day as an ISO `yyyy-mm-dd` string.
 *
 * The `en-CA` locale renders dates in ISO order, so this is the local-timezone
 * "today" the backend validates weight dates against (#24) and the dashboard
 * queries by. Call it at the moment you need the date — a long-open form should
 * read the day at submit time, not at mount.
 */
export function localToday(): string {
  return new Date().toLocaleDateString('en-CA')
}

/**
 * Format an ISO `yyyy-mm-dd` date as e.g. `3 Jun 2026`.
 *
 * The Date is built from the parts rather than parsed from the string so a
 * non-UTC runtime/test timezone can't shift the day off the stored ISO date.
 */
export function formatDateFromISO(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
