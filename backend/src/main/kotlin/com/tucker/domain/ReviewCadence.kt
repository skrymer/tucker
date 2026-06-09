package com.tucker.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * The weekly cadence of the adaptive engine, as a single shared predicate: a
 * [WeeklyReview] is *overdue* once the latest one has aged past the cadence. Both
 * the lazy catch-up (which runs the due review on app use) and the Weekly-Review
 * Reminder (which nudges an absent user) ask the *same* question here, so the two
 * can never disagree on when a week is up (ADR 0010).
 */
object ReviewCadence {

    /** A review is due once the latest one is this many days old. */
    const val REVIEW_CADENCE_DAYS = 7L

    /** Whether the latest review (or its absence) is overdue as of [today]. */
    fun isOverdue(latestReviewOn: LocalDate?, today: LocalDate): Boolean =
        latestReviewOn == null || ChronoUnit.DAYS.between(latestReviewOn, today) >= REVIEW_CADENCE_DAYS
}
