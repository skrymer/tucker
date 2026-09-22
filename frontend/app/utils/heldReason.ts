import type { components } from '#open-fetch-schemas/api'

/** Why a Weekly Review carried its Maintenance forward instead of correcting it. */
export type HeldReason = NonNullable<
  components['schemas']['DailySummaryResponse']['heldReason']
>

/**
 * How each reason qualifies the basis badge, and the one thing that would lift it.
 * The qualifier is appended to the `HELD` label rather than replacing it, so the
 * word "Held" is spelled in one place (`REVIEW_BASIS_BADGE`) whatever qualifies it.
 */
export const HELD_REASON_COPY: Record<
  HeldReason,
  { qualifier: string; remedy: string }
> = {
  THIN_LOG: {
    qualifier: 'thin log',
    // "More of the food you eat", not "more of your days": the same condition covers a
    // fortnight logged only as zero-calorie entries, where every day carries an Entry.
    remedy: 'Log more of the food you eat and Tucker can adapt it again.',
  },
  UNWEIGHED_WINDOW: {
    qualifier: 'no weigh-in',
    remedy: 'Weigh in once and Tucker can adapt it again.',
  },
  NO_WINDOW_ANCHOR: {
    qualifier: 'short history',
    // Time, not effort: this user may be weighing every day and still have no
    // reading old enough to measure a fortnight's change from.
    remedy:
      'Keep weighing in — Tucker needs a fortnight of readings to adapt it.',
  },
  BELOW_BASAL_RATE: {
    // Both halves state the finding rather than its cause. The engine knows only that
    // the log and the scale disagree; an incomplete log is much the likeliest reason
    // but not the only one — a trend built from few readings understates a real fall
    // (ADR 0018's #292 amendment measures it), so a diligent logger reaches this too,
    // and accusing them would be exactly the inference ADR 0031 refuses to persist.
    qualifier: 'log and scale disagree',
    remedy:
      'Your logged food and your weight do not line up yet — keep logging and weighing, and Tucker can adapt it again.',
  },
}
