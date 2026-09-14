package com.tucker.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * One day of a [WeightTimeline]: the reading taken that day, if there was one, and
 * the Trend Weight standing through it.
 *
 * [weightKg] is null on a day nobody weighed in — shown as a gap in the scatter,
 * never as a zero. [trendKg] is never null: the window starts where the readings
 * do, so every day it carries has a trend behind it.
 */
data class WeightTimelineDay(
    val date: LocalDate,
    val weightKg: Double?,
    val trendKg: Double,
)

/**
 * A Weight Timeline (CONTEXT.md, ADR 0029): what a User's weight did over the
 * trailing 28 or 90 days — every Weight Measurement in the window, and the Trend
 * Weight through them.
 *
 * [from] is where the timeline actually starts, which is not always where the
 * caller's window did — see [of].
 */
data class WeightTimeline(
    val from: LocalDate,
    val to: LocalDate,
    val days: List<WeightTimelineDay>,
) {
    companion object {
        /**
         * The widths a Weight Timeline is read over, and the only ones. 28 is the span
         * the observed pace, Pace Status and Drift Status are already classified over,
         * so the chart is the evidence for a status the User is already shown.
         */
        val WINDOW_DAYS = setOf(28L, 90L)

        /**
         * Refuse any width but [WINDOW_DAYS], as [MicronutrientIntake.of] and
         * [FrequentFoods.rank] refuse their own: the width is an invariant of this
         * read, not a caller's choice.
         */
        private fun requireWindow(from: LocalDate, to: LocalDate) {
            val span = ChronoUnit.DAYS.between(from, to) + 1
            require(span in WINDOW_DAYS) {
                "a Weight Timeline is read over $WINDOW_DAYS days, was $from..$to"
            }
        }

        /**
         * The window [from]..[to], both bounds inclusive, over the User's **whole**
         * reading history — the trend at a window's start depends on readings from
         * before it, so [measurements] is sliced here rather than by the query.
         *
         * Null when the timeline is withheld: until the trend is established there is
         * no shape worth drawing, only a handful of points — and likewise when the
         * window closes before the readings begin.
         */
        fun of(
            from: LocalDate,
            to: LocalDate,
            measurements: List<WeightMeasurement>,
        ): WeightTimeline? {
            requireWindow(from, to)
            val trend = WeightTrend.from(measurements)
            val start = drawableStart(from, to, trend) ?: return null
            val readings = measurements.associateBy { it.measuredOn }
            val days = generateSequence(start) { it.plusDays(1) }
                .takeWhile { !it.isAfter(to) }
                .map { day ->
                    WeightTimelineDay(
                        date = day,
                        weightKg = readings[day]?.weightKg,
                        // Never null: the window starts no earlier than the first
                        // reading, so every day it carries has a trend standing
                        // through it — carried forward from the last weigh-in,
                        // because the trend moves only when the scale does.
                        trendKg = trend.standingOn(day)!!.trendKg,
                    )
                }
                .toList()
            return WeightTimeline(from = start, to = to, days = days)
        }

        /**
         * The day the timeline opens on, or null when there is none to draw.
         *
         * Cut to where the readings start rather than padded back to [from]: empty
         * days before the first reading would claim weight data is missing rather
         * than that the User had not started weighing in yet.
         */
        private fun drawableStart(
            from: LocalDate,
            to: LocalDate,
            trend: WeightTrend,
        ): LocalDate? {
            // Withheld whole rather than drawn thin, on the threshold behind the
            // observed pace rather than a second number of its own (ADR 0029).
            if (!trend.isEstablished()) return null
            // Established, so there is a first reading to start at — and nothing to
            // draw when the window closes before it. A device whose clock ran fast
            // stamps its readings after [to], and cutting the start forward
            // regardless would return a timeline starting after it ends.
            return maxOf(from, trend.points.first().date).takeIf { !it.isAfter(to) }
        }
    }
}
