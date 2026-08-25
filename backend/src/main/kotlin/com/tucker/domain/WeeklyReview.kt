package com.tucker.domain

import java.time.LocalDate

/**
 * One weekly run of the review engine, and the dated historical record it leaves
 * behind — once written, a WeeklyReview is not changed.
 *
 * It has two jobs, and only the second is optional. Every review records the
 * [trendWeightKg] the week is read against; a review run with Calorie Tracking on
 * *also* carries [intakeTargets] — the week's Maintenance, Calorie Budget and
 * Protein Floor. With it off there are none, because a Budget derived from an
 * empty log is one the adaptive correction can never bring back to the truth.
 */
data class WeeklyReview(
    val id: Long?,
    val reviewedOn: LocalDate,
    val trendWeightKg: Double,
    val intakeTargets: IntakeTargets?,
) {
    init {
        require(trendWeightKg > 0) { "trendWeightKg must be > 0" }
    }
}
