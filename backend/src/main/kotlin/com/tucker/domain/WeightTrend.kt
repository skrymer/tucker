package com.tucker.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.pow

/**
 * The smoothed body-weight trend — an exponentially-weighted moving average over
 * Weight Measurements. Goal progress and the adaptive Maintenance correction run
 * on the Trend Weight, never on a single noisy measurement.
 *
 * [from] is the only way to build one, and that is structural rather than a
 * convention: [changeSince] and [observedRateKgPerWeek] divide out the shrinkage the
 * smoothing applied (ADR 0032), which can only be divided out of points that actually
 * suffered it. Hand-placed points read several percent fast, and up to twice as fast
 * where they sit close together.
 */
@ConsistentCopyVisibility
data class WeightTrend private constructor(val points: List<Point>) {

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
     * Where the trend stands on [date]: the latest point on or before it, carried
     * forward, because the trend moves only when the scale does. Null before the
     * first reading.
     *
     * With sparse weighing the point can be far older than [date], so what it
     * measures is only readable against the day it was actually taken — a caller
     * asking "how far has it moved" wants a [Change] instead, whose both ends are
     * days a reading was taken.
     */
    fun standingOn(date: LocalDate): Point? = points.getOrNull(indexStandingOn(date))

    /**
     * Where [standingOn] resolves to, as an index — -1 before the first reading. The
     * one spelling of "the latest point on or before this date", which the anchors
     * [changeSince] and [observedRateKgPerWeek] pick both need as a position rather
     * than as a point.
     */
    private fun indexStandingOn(date: LocalDate): Int =
        points.indexOfLast { !it.date.isAfter(date) }

    /**
     * Whether enough of the scale's evidence has accumulated to read the trend as a
     * shape rather than as a handful of points — [MIN_HISTORY_DAYS] days carrying a
     * Weight Measurement.
     *
     * Counted in readings, where [observedRateKgPerWeek] withholds on the *span* it
     * would divide by. One threshold, two questions: a rate needs days to divide
     * across, a drawn trend needs points to be a line.
     */
    fun isEstablished(): Boolean = points.size >= MIN_HISTORY_DAYS

    /**
     * How far the trend has moved since the latest point on or before [from], across
     * the days between that point and the latest of all. Both ends are days a reading
     * was actually taken, so it carries the rate observed rather than one stretched
     * over days holding no evidence. Null when no point reaches back that far.
     *
     * The movement is the real one, not the plain difference of the two trend points —
     * see [movedBetween].
     */
    fun changeSince(from: LocalDate): Change? {
        val anchor = indexStandingOn(from)
        if (anchor < 0) return null
        // An anchor was found, so the list is non-empty and this is `latest()`'s far end.
        val latest = points.lastIndex
        return Change(
            kg = movedBetween(anchor, latest),
            overDays = ChronoUnit.DAYS.between(points[anchor].date, points[latest].date),
        )
    }

    /**
     * How far the trend rose between the points at [from] and [to], signed like the
     * trend itself, with the smoothing's own shrinkage divided back out.
     *
     * A smoothed value lags the body, and until that lag has settled two points carry
     * different amounts of it, so their plain difference shows less of a movement than
     * happened — always less, never more. Dividing by [capturedBetween] recovers it
     * (ADR 0032).
     *
     * Zero across no days, which is what both ends resolving to one point means:
     * nothing has been weighed since, so there is no movement to recover and nothing
     * to divide.
     */
    private fun movedBetween(from: Int, to: Int): Double {
        val days = ChronoUnit.DAYS.between(points[from].date, points[to].date)
        if (days == 0L) return 0.0
        return (points[to].trendKg - points[from].trendKg) / capturedBetween(from, to)
    }

    /**
     * How much of a real movement the smoothing shows between the points at [from]
     * and [to] — per day, so 1.0 is a trend that misses nothing and 0.5 one that
     * halves what happened.
     *
     * Read off a synthetic ramp of one kilogram a day pushed through the same
     * recursion on this trend's own reading dates, so it depends on *when* the User
     * weighed and never on *what* they weighed. On a steady series it is the exact
     * factor the smoothing applied, at any cadence and any depth, which is what makes
     * dividing by it a correction rather than an estimate.
     *
     * Never reported below [MIN_CAPTURE] though, so the correction it drives can at
     * most double — and there the exactness is deliberately given up, because past
     * that point most of the answer would come from this arithmetic rather than from
     * the scale, and recovering a movement is not the same as inventing one (ADR 0032).
     */
    private fun capturedBetween(from: Int, to: Int): Double {
        val dates = points.map { it.date }
        val start = dates.first()
        val ramp = smooth(dates, dates.map { ChronoUnit.DAYS.between(start, it).toDouble() })
        val days = ChronoUnit.DAYS.between(dates[from], dates[to])
        return ((ramp[to].trendKg - ramp[from].trendKg) / days).coerceAtLeast(MIN_CAPTURE)
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
        // The last point on or before the window opened, or the earliest there is.
        val anchor = indexStandingOn(today.minusDays(OBSERVED_WINDOW_DAYS)).coerceAtLeast(0)
        // Loss-positive, where [movedBetween] is signed like the trend itself.
        val fell = -movedBetween(anchor, points.lastIndex)
        // Divides to [today], not to the anchor's far end as [changeSince] does. ADR 0018
        // rules that asymmetry out of scope here: this feeds Drift Status and goal pace,
        // which are read as "where the trend stands now", not a correction to an intake window.
        val spanDays = ChronoUnit.DAYS.between(points[anchor].date, today)
        return fell / spanDays * Goal.DAYS_PER_WEEK
    }

    companion object {
        /**
         * EWMA smoothing factor — the weight a reading is given when it is a day
         * newer than the one before it. Compounded over the gap, so this is a rate
         * per **day** and not per reading (ADR 0032): half the distance to a new
         * level is covered in about a week, whether that week held seven readings or
         * one.
         */
        const val SMOOTHING = 0.10

        /**
         * The least of a real movement the smoothing may show before Tucker stops
         * recovering the rest of it — half, so a corrected change is at most double
         * what the trend itself showed.
         */
        const val MIN_CAPTURE = 0.5

        /** The trailing window the observed rate is measured over. */
        const val OBSERVED_WINDOW_DAYS = 28L

        /**
         * The least history a trend may be read from: the observed rate is withheld
         * until the trend *spans* this long, and a drawn trend until this many days
         * carry a reading (see [isEstablished]).
         */
        const val MIN_HISTORY_DAYS = 14L

        /**
         * Build the trend from measurements given in any order, one to a day. Two on
         * one date are refused rather than smoothed: the decay compounds over the days
         * between readings, so a gap of none retains the whole trend and the second
         * reading would move it not at all. A User has one reading a day by
         * construction (`idx_weight_measurement_user_day`), so this is a caller bug.
         */
        fun from(measurements: List<WeightMeasurement>): WeightTrend {
            val sorted = measurements.sortedBy { it.measuredOn }
            val dates = sorted.map { it.measuredOn }
            require(dates.distinct().size == dates.size) {
                "a trend takes one measurement per day, was $dates"
            }
            return WeightTrend(smooth(dates, sorted.map { it.weightKg }))
        }

        /**
         * The smoothing itself, over [values] read on [dates] in ascending order —
         * real weights for [from], a synthetic ramp for [capturedBetween].
         */
        private fun smooth(dates: List<LocalDate>, values: List<Double>): List<Point> {
            val points = mutableListOf<Point>()
            var trend = 0.0
            dates.forEachIndexed { index, date ->
                trend = if (index == 0) {
                    values[index]
                } else {
                    // Compounded over the gap, so a fortnight between readings decays
                    // like a fortnight and not like the one reading it happens to be.
                    val gapDays = ChronoUnit.DAYS.between(dates[index - 1], date)
                    val retained = (1 - SMOOTHING).pow(gapDays.toDouble())
                    (1 - retained) * values[index] + retained * trend
                }
                points += Point(date, trend)
            }
            return points
        }
    }
}
