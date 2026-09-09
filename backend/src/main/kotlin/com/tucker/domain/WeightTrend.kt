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

    /**
     * A movement in the Trend Weight and the days it was observed across — one value,
     * because a daily rate needs both and is wrong if they came from different spans.
     */
    data class Change(val kg: Double, val overDays: Long) {
        init {
            require(overDays >= 0) { "overDays must not be negative, was $overDays" }
            require(overDays > 0 || kg == 0.0) { "a change across no days must be zero, was $kg kg" }
        }
    }

    /** The most recent trend point, or null when there are no measurements. */
    fun latest(): Point? = points.lastOrNull()

    /**
     * The latest trend point on or before [date], if any. With sparse weighing it can
     * be far older than [date], and what it measures is only readable against the day
     * it was actually taken — so it stays private, and callers ask for a [Change].
     */
    private fun asOf(date: LocalDate): Point? =
        points.lastOrNull { !it.date.isAfter(date) }

    /**
     * How far the trend has moved since the latest point on or before [from], across
     * the days between that point and the latest of all. Both ends are days a reading
     * was actually taken, so it carries the rate observed rather than one stretched
     * over days holding no evidence. Null when no point reaches back that far.
     */
    fun changeSince(from: LocalDate): Change? {
        val anchor = asOf(from) ?: return null
        // `asOf` found a point, so the list is non-empty and this is `latest()`'s
        // far end — read directly rather than through a null check nothing can fail.
        val latest = points.last()
        return Change(
            kg = latest.trendKg - anchor.trendKg,
            overDays = ChronoUnit.DAYS.between(anchor.date, latest.date),
        )
    }

    /**
     * How many days carried a Weight Measurement after [from] — the evidence the
     * scale contributed about the window opening there. Strictly after, because the
     * newest reading on or before [from] is the anchor a [Change] is measured *from*,
     * and so is evidence about the days before it rather than the ones since.
     */
    fun weighedDaysSince(from: LocalDate): Int = points.count { it.date.isAfter(from) }

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
        val anchor = asOf(today.minusDays(OBSERVED_WINDOW_DAYS)) ?: earliest
        // Divides to [today], not to the anchor's far end as [changeSince] does. ADR 0018
        // rules that asymmetry out of scope here: this feeds Drift Status and goal pace,
        // which are read as "where the trend stands now", not a correction to an intake window.
        val spanDays = ChronoUnit.DAYS.between(anchor.date, today)
        return (anchor.trendKg - currentTrendKg) / spanDays * Goal.DAYS_PER_WEEK
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
