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
  const [y, m, d] = isoParts(iso)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * `days` before an ISO `yyyy-mm-dd` day — the user's local today unless another
 * is given — as an ISO string; `0` is that day itself.
 *
 * Built from the parts like [formatDateFromISO], so a day that goes below 1
 * rolls back into the previous month and year rather than needing arithmetic of
 * its own.
 */
export function localDaysAgo(
  days: number,
  from: string = localToday(),
): string {
  const [y, m, d] = isoParts(from)
  return new Date(y, m - 1, d - days).toLocaleDateString('en-CA')
}

/**
 * The day before the user's local today — the latest day a birth date may fall
 * on, since a `Profile` requires one strictly in the past.
 */
export function localYesterday(): string {
  return localDaysAgo(1)
}

/**
 * How many days a window spans, both bounds inclusive — the same day is 1.
 *
 * Measured between UTC midnights rather than local ones: a local span crossing a
 * daylight-saving shift is an hour short of a whole number of days, which is a
 * rounding rule to get wrong rather than a fact about the calendar.
 */
export function daysInWindow(from: string, to: string): number {
  return (utcMidnightOf(to) - utcMidnightOf(from)) / MS_PER_DAY + 1
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function isoParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y!, m!, d!]
}

function utcMidnightOf(iso: string): number {
  const [y, m, d] = isoParts(iso)
  return Date.UTC(y, m - 1, d)
}
