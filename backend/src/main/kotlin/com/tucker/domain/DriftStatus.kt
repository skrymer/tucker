package com.tucker.domain

import java.time.LocalDate

/**
 * The Maintenance Mode counterpart of [PaceStatus]: with no Goal to pace against,
 * the observed Trend Weight slope is classified against a target rate of *zero*
 * within a ±[DRIFT_BAND_KG_PER_WEEK] band — [HOLDING] inside it, [DRIFTING_UP] or
 * [DRIFTING_DOWN] outside it, [GATHERING_DATA] until enough history exists. A
 * displayed status, not an alert (ADR 0008): the self-correcting Calorie Budget
 * already responds to drift at the next Weekly Review.
 */
enum class DriftStatus(val value: String) {
    HOLDING("holding"),
    DRIFTING_UP("drifting-up"),
    DRIFTING_DOWN("drifting-down"),
    GATHERING_DATA("gathering-data"),
    ;

    companion object {
        /** Tolerance band around the zero target rate, in kg/week (±0.1). */
        private const val DRIFT_BAND_KG_PER_WEEK = 0.1

        /** Classify [trend]'s trailing slope against zero as of [today]. */
        fun forTrend(trend: WeightTrend, today: LocalDate): DriftStatus =
            forRate(trend.observedRateKgPerWeek(today))

        /**
         * Classify an already-computed observed [rate] (kg/week, loss-positive) so
         * a caller that also needs the raw rate walks the trend only once. Null —
         * the withheld rate before enough history — is [GATHERING_DATA].
         */
        fun forRate(rate: Double?): DriftStatus {
            // Falling past the band drifts down, rising past it drifts up; inside is holding.
            rate ?: return GATHERING_DATA
            return when {
                rate > DRIFT_BAND_KG_PER_WEEK -> DRIFTING_DOWN
                rate < -DRIFT_BAND_KG_PER_WEEK -> DRIFTING_UP
                else -> HOLDING
            }
        }
    }
}
