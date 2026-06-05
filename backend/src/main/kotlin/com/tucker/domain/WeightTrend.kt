package com.tucker.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * The smoothed body-weight trend — an exponentially-weighted moving average over
 * Weight Measurements. Goal progress and the adaptive Maintenance correction run
 * on the Trend Weight, never on a single noisy measurement.
 */
data class WeightTrend(val points: List<Point>) {

    data class Point(val date: LocalDate, val trendKg: Double)

    /** The most recent trend point, or null when there are no measurements. */
    fun latest(): Point? = points.lastOrNull()

    /** The trend value at the latest point on or before [date], if any. */
    fun asOf(date: LocalDate): Double? =
        points.lastOrNull { !it.date.isAfter(date) }?.trendKg

    /**
     * The trend's rate of loss (kg/week, positive when falling, negative when
     * gaining) over the trailing window ending at [today]: the slope from the
     * trend point ~[OBSERVED_WINDOW_DAYS] days ago (or the earliest available,
     * once history is shorter) to the latest. Null until the trend spans at
     * least [MIN_HISTORY_DAYS].
     */
    fun observedRateKgPerWeek(today: LocalDate): Double? {
        val earliest = points.firstOrNull()
        if (earliest == null ||
            ChronoUnit.DAYS.between(earliest.date, today) < MIN_HISTORY_DAYS
        ) {
            return null
        }
        val currentTrendKg = points.last().trendKg
        val anchor = points.lastOrNull {
            !it.date.isAfter(today.minusDays(OBSERVED_WINDOW_DAYS))
        } ?: earliest
        val windowDays = ChronoUnit.DAYS.between(anchor.date, today)
        return (anchor.trendKg - currentTrendKg) / windowDays * Goal.DAYS_PER_WEEK
    }

    companion object {
        /** EWMA smoothing factor — the weight given to each new measurement. */
        const val SMOOTHING = 0.10

        /** The trailing window the observed rate is measured over. */
        const val OBSERVED_WINDOW_DAYS = 28L

        /** The observed rate is withheld until the trend spans at least this long. */
        const val MIN_HISTORY_DAYS = 14L

        /** Build the trend from measurements given in any order. */
        fun from(measurements: List<WeightMeasurement>): WeightTrend {
            val points = mutableListOf<Point>()
            var trend = 0.0
            measurements.sortedBy { it.measuredOn }.forEachIndexed { index, m ->
                trend = if (index == 0) m.weightKg
                        else SMOOTHING * m.weightKg + (1 - SMOOTHING) * trend
                points += Point(m.measuredOn, trend)
            }
            return WeightTrend(points)
        }
    }
}
