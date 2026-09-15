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
    val caloriesKcal: Double?,
    val calorieBudgetKcal: Double?,
    /**
     * Whether the day's calories went past the Budget it was read against — the
     * verdict, not the comparison, because a client that derived it could disagree
     * with the same day's DayStatus (ADR 0002). Null when there is nothing to
     * exceed: no Entry, or no Budget in force.
     */
    val overBudget: Boolean?,
)

/**
 * What the intake half of a [WeightTimeline] is drawn from: the calories logged
 * per day, and the reviews whose Intake Targets set the Budget in force on each.
 *
 * One value object rather than two parameters, so the whole half is present or
 * absent together — with Calorie Tracking off there is no [TimelineIntake] at all
 * (ADR 0024, ADR 0029).
 */
class TimelineIntake(
    private val caloriesByDay: Map<LocalDate, Double>,
    reviews: List<WeeklyReview>,
) {
    /** Oldest first, so [budgetOn] is a scan back rather than a filtered copy per day. */
    private val inOrder = reviews.sortedBy { it.reviewedOn }

    /** What was logged on [date], or null on a day with no Entry — absent, never zero. */
    fun caloriesOn(date: LocalDate): Double? = caloriesByDay[date]

    /**
     * The Calorie Budget in force on [date] — the latest review dated on or before
     * it, which is the one whose targets were standing that day. Null before the
     * first review, and on a day whose review carried none: ADR 0024 withdrew the
     * figure for a week reviewed with Calorie Tracking off, so reaching past that
     * review would draw a line the User was never held to.
     *
     * The same shape as [WeightTrend.standingOn], which asks the same question of
     * the readings.
     */
    fun budgetOn(date: LocalDate): Double? = inOrder
        .lastOrNull { !it.reviewedOn.isAfter(date) }
        ?.intakeTargets
        ?.calorieBudgetKcal

    /**
     * Whether [date] went past its Budget, or null when there is nothing to exceed.
     * The same unrounded comparison [DailyLog.dayStatus] makes, so the chart and the
     * day's own status can never disagree.
     */
    fun overBudgetOn(date: LocalDate): Boolean? {
        val budget = budgetOn(date)
        return if (budget == null) null else caloriesOn(date)?.let { it > budget }
    }
}

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
    val loggedDays: Int?,
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
         *
         * [intake] is a supplier because it is three more reads, and a withheld
         * timeline has nothing to spend them on.
         */
        fun of(
            from: LocalDate,
            to: LocalDate,
            measurements: List<WeightMeasurement>,
            intake: () -> TimelineIntake? = { null },
        ): WeightTimeline? {
            requireWindow(from, to)
            val trend = WeightTrend.from(measurements)
            val start = drawableStart(from, to, trend) ?: return null
            val logged = intake()
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
                        caloriesKcal = logged?.caloriesOn(day),
                        calorieBudgetKcal = logged?.budgetOn(day),
                        overBudget = logged?.overBudgetOn(day),
                    )
                }
                .toList()
            return WeightTimeline(
                from = start,
                to = to,
                days = days,
                // Off the days actually drawn rather than off the log: a day logged
                // before the timeline starts is not one of the days it is a count of.
                loggedDays = logged?.let { days.count { day -> day.caloriesKcal != null } },
            )
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
