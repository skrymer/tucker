package com.tucker.domain

import java.time.LocalDate

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

    companion object {
        /** EWMA smoothing factor — the weight given to each new measurement. */
        const val SMOOTHING = 0.10

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
