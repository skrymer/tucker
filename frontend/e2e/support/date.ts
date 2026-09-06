/**
 * The single home for date construction in `e2e/` (issue #85).
 *
 * Two clocks, and which one a spec wants depends on who stamped the date it is
 * reading. A date the **backend** owns is UTC: both ends of the smoke stack are
 * pinned to it (#84), and [todayIso] / [isoShiftDays] compute in **explicit UTC**
 * so that agreement no longer leans on the process timezone. A date the
 * **client** stamps is local (ADR 0014), which is [localTodayIso]. ([formatDmy]
 * and [monthNameOf] are display-only and build from the parts — see their notes.)
 *
 * A lint guard (see the `e2e/**` block in `eslint.config.mjs`) bans hand-rolled
 * `toLocaleDateString` and bare `new Date()` elsewhere in `e2e/`, routing date
 * construction through here.
 */

/**
 * The timezone the mocked browser runs in, and the one [localTodayIso] answers
 * for. `playwright.config.ts` imports it rather than restating it, so the
 * agreement between the browser's day and the runner's is executable.
 *
 * Deliberately **not** UTC: pinned to UTC the local and UTC days would always be
 * equal, and the one class of bug this distinction exists to catch — a client
 * date compared against a backend one — would never fail anywhere. Brisbane is
 * a stable UTC+10 with no daylight saving, so it is a day ahead of UTC for part
 * of every day and never half an hour off.
 */
export const MOCKED_E2E_TIMEZONE = 'Australia/Brisbane'

/** Today's calendar day as an ISO `yyyy-mm-dd` string, in UTC. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Today's calendar day in [MOCKED_E2E_TIMEZONE] — the app's own `localToday`
 * (ADR 0014) as the mocked browser computes it. What a spec must expect whenever
 * it reads a date the *client* stamped; the runner's own zone is not consulted,
 * so a spec means the same thing on a laptop and in CI.
 *
 * **Mocked e2e only.** The smoke config pins the *process* to `Etc/UTC` and sets
 * no `timezoneId`, so a smoke's browser follows the runner and wants [todayIso].
 */
export function localTodayIso(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: MOCKED_E2E_TIMEZONE,
  })
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

/**
 * The full month name of an ISO `yyyy-mm-dd` date, e.g. `March` — the form the
 * calendar's own month cells and day labels use. Built from the parts like
 * [formatDmy], so only the localized name is locale-driven (pinned to `en-US`,
 * which is what the picker renders).
 */
export function monthNameOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-US', { month: 'long' })
}
