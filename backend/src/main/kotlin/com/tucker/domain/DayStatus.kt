package com.tucker.domain

/**
 * The earned verdict on a day's intake against that day's Calorie Budget and
 * Protein Floor. Unlike a binary on/off-target test, it distinguishes a day
 * still in progress from one that has earned a verdict — the two halves of the
 * old predicate have opposite intra-day characters:
 *
 * - [OVER_BUDGET] the moment intake exceeds the Calorie Budget — real and
 *   irreversible, so it wins unconditionally (over budget with the Floor met is
 *   still over budget, not on-target).
 * - [ON_TARGET] once the Protein Floor is met with intake at or under the
 *   Calorie Budget — earned and stable, since a met Floor never un-meets.
 * - [IN_PROGRESS] otherwise — being under the Floor mid-day isn't a failure, the
 *   day just isn't finished, so it carries no verdict.
 *
 * A displayed verdict, not an alert.
 */
enum class DayStatus(val value: String) {
    ON_TARGET("on-target"),
    OVER_BUDGET("over-budget"),
    IN_PROGRESS("in-progress"),
}
