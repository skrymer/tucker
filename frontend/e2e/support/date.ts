/**
 * The single home for date construction in `e2e/` (issue #85).
 *
 * Smokes seed dates that must agree with the backend on which calendar day
 * "today" is. Both ends of the smoke stack are pinned to UTC (#84), and the
 * day-arithmetic helpers ([todayIso], [isoShiftDays]) compute in **explicit UTC**
 * so that agreement no longer leans on the process timezone. ([formatDmy] is
 * display-only and deliberately local — see its own note.) A lint guard (see the
 * `e2e/**` block in `eslint.config.mjs`) bans hand-rolled `toLocaleDateString`
 * and bare `new Date()` elsewhere in `e2e/`, routing date construction through here.
 */

/** Today's calendar day as an ISO `yyyy-mm-dd` string, in UTC. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * An ISO `yyyy-mm-dd` date shifted by whole days (negative shifts backwards),
 * computed in UTC so it can't drift across a DST or timezone boundary.
 */
export function isoShiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/**
 * Format an ISO `yyyy-mm-dd` date as e.g. `1 Jan 2015`. Mirrors the app's
 * `formatDateFromISO` (app/utils/date.ts) byte-for-byte so a smoke's expected
 * string matches what the app renders — kept as a copy because e2e specs can't
 * resolve the app's `~/` import alias under Playwright's tsconfig; keep the two in
 * sync. Built from the date parts, so the day is stable regardless of timezone
 * (only the localized month name is locale-driven, pinned here to `en-GB`).
 */
export function formatDmy(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
