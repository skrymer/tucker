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

/**
 * The day before the user's local today, as an ISO `yyyy-mm-dd` string.
 *
 * The latest day a birth date may fall on, since a `Profile` requires one
 * strictly in the past. Built from the parts like [formatDateFromISO], so a
 * day of `0` rolls back into the previous month and year rather than needing
 * arithmetic of its own.
 */
export function localYesterday(): string {
  const [y, m, d] = localToday().split('-').map(Number)
  return new Date(y!, m! - 1, d! - 1).toLocaleDateString('en-CA')
}
