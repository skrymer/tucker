package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/**
 * The rules of a Weight Timeline (CONTEXT.md, ADR 0029). Selecting the readings is
 * the repository's job; these are the rules that turn a User's whole reading
 * history into the window they are shown.
 */
class WeightTimelineTest {

    private val to = LocalDate.of(2026, 9, 6)
    private val from = to.minusDays(27)

    /** Daily readings ending on [to], newest last — [kg] is read in that order. */
    private fun daily(vararg kg: Double, endingOn: LocalDate = to) =
        kg.mapIndexed { index, weight ->
            WeightMeasurement(
                id = null,
                measuredOn = endingOn.minusDays((kg.size - 1 - index).toLong()),
                weightKg = weight,
            )
        }

    /** A review dated [on] carrying [budgetKcal] as that week's Calorie Budget. */
    private fun review(on: LocalDate, budgetKcal: Double) = WeeklyReview(
        id = null,
        reviewedOn = on,
        trendWeightKg = 80.0,
        intakeTargets = IntakeTargets(
            maintenance = Maintenance(kcal = budgetKcal + 500, basis = Maintenance.Basis.FORMULA_SEED),
            calorieBudgetKcal = budgetKcal,
            proteinFloorG = 160.0,
        ),
    )

    /** An active weight-loss Goal, targeting four kilos below wherever it started. */
    private fun goal(startedOn: LocalDate, startWeightKg: Double, rateKgPerWeek: Double) = Goal(
        id = 1,
        startedOn = startedOn,
        startWeightKg = startWeightKg,
        targetWeightKg = startWeightKg - 4.0,
        rateKgPerWeek = rateKgPerWeek,
        active = true,
    )

    @Test
    fun `a day carries the calories logged on it and the Budget in force that day`() {
        val intake = TimelineIntake(
            caloriesByDay = mapOf(to to 1750.0),
            reviews = listOf(review(from, budgetKcal = 1800.0)),
        )

        val timeline = WeightTimeline.of(from, to, daily(*DoubleArray(28) { 80.0 })) { intake }!!

        assertEquals(1750.0, timeline.days.last().caloriesKcal)
        assertEquals(1800.0, timeline.days.last().calorieBudgetKcal)
    }

    @Test
    fun `a day is read against the Budget in force on it, not the latest review's`() {
        // A Budget is set by a Weekly Review and holds until the next one, so a
        // window spanning a change carries both figures, each on its own days.
        val raised = to.minusDays(6)
        val intake = TimelineIntake(
            caloriesByDay = emptyMap(),
            reviews = listOf(review(from, budgetKcal = 1800.0), review(raised, budgetKcal = 1750.0)),
        )

        val timeline = WeightTimeline.of(from, to, daily(*DoubleArray(28) { 80.0 })) { intake }!!

        val budgets = timeline.days.associate { it.date to it.calorieBudgetKcal }
        assertEquals(1800.0, budgets[raised.minusDays(1)])
        assertEquals(1750.0, budgets[raised])
        assertEquals(1750.0, budgets[to])
    }

    @Test
    fun `a timeline counts the days it drew that carry an Entry`() {
        // Twenty days of readings, so the window is cut back to them — and a day
        // logged before that start is a day the timeline does not draw, so counting
        // the log rather than the drawn days would over-state its own coverage.
        val twentyDays = daily(*DoubleArray(20) { 80.0 })
        val intake = TimelineIntake(
            caloriesByDay = mapOf(
                to.minusDays(25) to 2100.0,
                to.minusDays(1) to 1900.0,
                to to 1750.0,
            ),
            reviews = listOf(review(from, budgetKcal = 1800.0)),
        )

        val timeline = WeightTimeline.of(from, to, twentyDays) { intake }!!

        assertEquals(TimelineEvidenceSummary.Intake(loggedDays = 2), timeline.evidence)
    }

    @Test
    fun `a day with no Entry carries no calories rather than none eaten`() {
        // A missing bar and a floor-height bar are the same picture, and "you ate
        // nothing" is the reading ADR 0018 exists to refuse — the engine averages
        // over the days actually logged so a gap cannot drag Maintenance down.
        val intake = TimelineIntake(
            caloriesByDay = mapOf(to to 1750.0),
            reviews = listOf(review(from, budgetKcal = 1800.0)),
        )

        val timeline = WeightTimeline.of(from, to, daily(*DoubleArray(28) { 80.0 })) { intake }!!

        assertNull(timeline.days[timeline.days.size - 2].caloriesKcal)
        // The Budget still stands on it: it was set by a review and holds all week,
        // so it applied that day exactly as on the days either side.
        assertEquals(1800.0, timeline.days[timeline.days.size - 2].calorieBudgetKcal)
    }

    @Test
    fun `with Calorie Tracking off the intake half is absent, not empty`() {
        // Weight is the premise and intake the addition, so the addition is simply
        // not there — the client is never left hiding a half it was handed.
        val timeline = WeightTimeline.of(from, to, daily(*DoubleArray(28) { 80.0 }))!!

        assertNull(timeline.evidence)
        assertEquals(emptyList<Double>(), timeline.days.mapNotNull { it.caloriesKcal })
        assertEquals(emptyList<Double>(), timeline.days.mapNotNull { it.calorieBudgetKcal })
    }

    @Test
    fun `a day whose review carried no targets has no Budget, not the last one that did`() {
        // A week reviewed with Calorie Tracking off carries no Intake Targets
        // (ADR 0024), so no Budget was in force then — reaching back past it would
        // draw a line the User was never held to.
        val trackingOff = to.minusDays(6)
        val intake = TimelineIntake(
            caloriesByDay = emptyMap(),
            reviews = listOf(
                review(from, budgetKcal = 1800.0),
                WeeklyReview(id = null, reviewedOn = trackingOff, trendWeightKg = 80.0, intakeTargets = null),
            ),
        )

        val timeline = WeightTimeline.of(from, to, daily(*DoubleArray(28) { 80.0 })) { intake }!!

        val budgets = timeline.days.associate { it.date to it.calorieBudgetKcal }
        assertEquals(1800.0, budgets[trackingOff.minusDays(1)])
        assertNull(budgets[trackingOff])
        assertNull(budgets[to])
    }

    @Test
    fun `a day before the first review has no Budget yet`() {
        // A window opens where the readings start, which can be before the User was
        // ever given a figure to eat to.
        val firstReview = to.minusDays(20)
        val intake = TimelineIntake(
            caloriesByDay = mapOf(from to 2000.0),
            reviews = listOf(review(firstReview, budgetKcal = 1800.0)),
        )

        val timeline = WeightTimeline.of(from, to, daily(*DoubleArray(28) { 80.0 })) { intake }!!

        val budgets = timeline.days.associate { it.date to it.calorieBudgetKcal }
        assertNull(budgets[from])
        assertEquals(1800.0, budgets[firstReview])
    }

    @Test
    fun `a day says whether it went over the Budget it was read against`() {
        // The verdict is the backend's, on the unrounded rule DailyLog already uses
        // for a day's own DayStatus, so the chart and Today cannot disagree about
        // the same day.
        val intake = TimelineIntake(
            caloriesByDay = mapOf(to to 1800.4, to.minusDays(1) to 1800.0),
            reviews = listOf(review(from, budgetKcal = 1800.0)),
        )

        val timeline = WeightTimeline.of(from, to, daily(*DoubleArray(28) { 80.0 })) { intake }!!

        val verdicts = timeline.days.associate { it.date to it.overBudget }
        assertEquals(true, verdicts[to])
        assertEquals(false, verdicts[to.minusDays(1)])
        // There is nothing to have exceeded on a day with no Entry.
        assertNull(verdicts[to.minusDays(2)])
    }

    @Test
    fun `a day carries the reading taken on it and the trend through it`() {
        // Twenty-seven steady days and one spike: the trend moves a tenth of the way
        // toward the new reading, so 0.1 x 90 + 0.9 x 80 is a hand-checkable 81.
        val steadyThenSpike = daily(*DoubleArray(27) { 80.0 }, 90.0)

        val timeline = WeightTimeline.of(from, to, steadyThenSpike)!!

        assertEquals(28, timeline.days.size)
        assertEquals(from, timeline.days.first().date)
        assertEquals(to, timeline.days.last().date)
        // One entry per day with none missing: the client draws a day at its
        // position in the run, so a gap would compress the time axis silently.
        assertEquals((0L..27L).map { from.plusDays(it) }, timeline.days.map { it.date })
        assertEquals(90.0, timeline.days.last().weightKg)
        assertEquals(81.0, timeline.days.last().trendKg, 1e-9)
    }

    @Test
    fun `a day nobody weighed in on holds the trend it already had, and no reading`() {
        // The trend moves only when the scale does, so a skipped day is not a gap in
        // the line — it is the same figure, standing still until the next reading.
        val stoppedTwoDaysAgo = daily(*DoubleArray(28) { 80.0 }).dropLast(2)

        val timeline = WeightTimeline.of(from, to, stoppedTwoDaysAgo)!!

        val lastTwo = timeline.days.takeLast(2)
        assertEquals(listOf(null, null), lastTwo.map { it.weightKg })
        assertEquals(listOf(80.0, 80.0), lastTwo.map { it.trendKg })
    }

    @Test
    fun `a window reaching back before the first reading starts where the readings do`() {
        // Padding it out would draw eight empty days, which claims weight data is
        // missing rather than that the User had not started weighing in yet.
        val twentyDays = daily(*DoubleArray(20) { 80.0 })

        val timeline = WeightTimeline.of(from, to, twentyDays)!!

        assertEquals(to.minusDays(19), timeline.from)
        assertEquals(to.minusDays(19), timeline.days.first().date)
        assertEquals(20, timeline.days.size)
    }

    @Test
    fun `the trend carries what the readings before the window did to it`() {
        // A month at 90 kg, then the window opens on the first reading at 80. The
        // trend moves a tenth of the way and opens at 89 — where a trend restarted
        // at the window's edge would open at 80, and every figure after it would be
        // a different number from the one the engine publishes.
        val lostTenKg = daily(*(DoubleArray(32) { 90.0 } + DoubleArray(28) { 80.0 }))

        val timeline = WeightTimeline.of(from, to, lostTenKg)!!

        assertEquals(from, timeline.days.first().date)
        assertEquals(89.0, timeline.days.first().trendKg, 1e-9)
    }

    @Test
    fun `a window of any width but 28 or 90 days is refused`() {
        // The width is an invariant of this read rather than a caller's choice, as
        // MicronutrientIntake and FrequentFoods each refuse their own: 28 is the
        // span Pace Status is already classified over, and 90 is the only other one
        // offered.
        val ninetyDays = daily(*DoubleArray(90) { 80.0 })

        listOf(7L, 29L, 91L).forEach { days ->
            assertFailsWith<IllegalArgumentException> {
                WeightTimeline.of(to.minusDays(days - 1), to, ninetyDays)
            }
        }
    }

    @Test
    fun `ninety days is a window too, and carries a day for each of them`() {
        val ninetyDays = daily(*DoubleArray(90) { 80.0 })

        val timeline = WeightTimeline.of(to.minusDays(89), to, ninetyDays)!!

        assertEquals(90, timeline.days.size)
    }

    @Test
    fun `a timeline is withheld under fourteen days of readings`() {
        // The threshold behind the observed pace, Pace Status and Drift Status, and
        // the same reason: a trend built from a handful of readings understates its
        // own movement, so drawing it invites reading a slope that is not there.
        val thirteenDays = daily(*DoubleArray(13) { 80.0 })

        assertNull(WeightTimeline.of(from, to, thirteenDays))
    }

    @Test
    fun `a fourteenth day of readings is enough for a timeline`() {
        val fourteenDays = daily(*DoubleArray(14) { 80.0 })

        val timeline = WeightTimeline.of(from, to, fourteenDays)!!

        assertEquals(14, timeline.days.size)
    }

    @Test
    fun `a day carries where the Goal's plan says the trend should stand`() {
        val plan = GoalTrajectory(goal(startedOn = from, startWeightKg = 82.0, rateKgPerWeek = 0.5))

        val timeline = WeightTimeline.of(from, to, daily(*DoubleArray(28) { 80.0 })) { plan }!!

        val planned = timeline.days.associate { it.date to it.trajectoryKg }
        assertEquals(82.0, planned[from])
        assertEquals(81.5, planned[from.plusDays(7)])
        assertEquals(81.0, planned[from.plusDays(14)])
        // A plan is not a log: the timeline names the plan as its evidence, so there
        // is no logged-day count to be read as a tracking window with nothing in it.
        assertEquals(TimelineEvidenceSummary.Plan(startsOn = from), timeline.evidence)
    }

    @Test
    fun `a day before the Goal was set carries no plan, the plan not existing yet`() {
        val setMidway = from.plusDays(14)
        val plan = GoalTrajectory(goal(startedOn = setMidway, startWeightKg = 82.0, rateKgPerWeek = 0.5))

        val timeline = WeightTimeline.of(from, to, daily(*DoubleArray(28) { 80.0 })) { plan }!!

        val planned = timeline.days.associate { it.date to it.trajectoryKg }
        assertNull(planned[from])
        assertNull(planned[setMidway.minusDays(1)])
        assertEquals(82.0, planned[setMidway])
    }

    @Test
    fun `the plan flattens at the target rather than carrying on below it`() {
        // Four kilos at half a kilo a week is reached on the 56th day; there is no
        // plan past it, and a line sloping on would draw one the User never made.
        val start = to.minusDays(89)
        val plan = GoalTrajectory(goal(startedOn = start, startWeightKg = 82.0, rateKgPerWeek = 0.5))

        val timeline = WeightTimeline.of(start, to, daily(*DoubleArray(90) { 80.0 })) { plan }!!

        val planned = timeline.days.associate { it.date to it.trajectoryKg }
        assertEquals(78.5, planned[start.plusDays(49)])
        assertEquals(78.0, planned[start.plusDays(56)])
        assertEquals(78.0, planned[to])
    }

    @Test
    fun `a window ending before the Goal started still says a plan is what it draws`() {
        // The two-device shape: a Goal set on a phone already into tomorrow, read on
        // a desktop whose window closes today. Every day's plan is null, which is
        // byte-for-byte what Maintenance Mode sends — loggedDays being null under a
        // plan too — so without this the card cannot tell the two apart (ADR 0029).
        val tomorrow = to.plusDays(1)
        val plan = GoalTrajectory(goal(startedOn = tomorrow, startWeightKg = 82.0, rateKgPerWeek = 0.5))

        val timeline = WeightTimeline.of(from, to, daily(*DoubleArray(28) { 80.0 })) { plan }!!

        assertEquals(
            TimelineEvidenceSummary.Plan(startsOn = tomorrow),
            timeline.evidence,
            "the plan exists and simply does not reach this window, which is a " +
                "different thing from defending no target weight at all",
        )
        assertNull(
            timeline.days.map { it.trajectoryKg }.firstOrNull { it != null },
            "and there is genuinely nothing to draw, which is what made the two " +
                "states identical in the first place",
        )
    }

    @Test
    fun `a window that ends before the readings begin has nothing to draw`() {
        // A device whose clock ran fast stamps readings in the future, and the
        // window then closes before the first of them. Cutting the start forward
        // would leave a timeline starting after it ends, which is a shape nothing
        // downstream can read.
        val nextMonth = daily(*DoubleArray(20) { 80.0 }, endingOn = to.plusMonths(1))

        assertNull(WeightTimeline.of(from, to, nextMonth))
    }
}
