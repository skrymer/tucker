package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNull

class GoalProgressTest {

    private val today = LocalDate.of(2026, 6, 3)

    private fun goal(
        startWeightKg: Double = 90.0,
        targetWeightKg: Double = 80.0,
        rateKgPerWeek: Double = 0.5,
    ) = Goal(
        id = null,
        startedOn = LocalDate.of(2026, 5, 1),
        startWeightKg = startWeightKg,
        targetWeightKg = targetWeightKg,
        rateKgPerWeek = rateKgPerWeek,
        active = true,
    )

    @Test
    fun `kg to go is the trend weight above the target`() {
        val progress = GoalProgress.planned(goal(), currentTrendKg = 86.0, today = today)

        assertEquals(6.0, progress.kgToGo, 1e-9)
    }

    @Test
    fun `percent complete is the share of the total loss already achieved`() {
        // 90 → 80 is 10 kg total; at 86 kg, 4 of those 10 kg are done.
        val progress = GoalProgress.planned(goal(), currentTrendKg = 86.0, today = today)

        assertEquals(40.0, progress.percentComplete, 1e-9)
    }

    @Test
    fun `planned finish date is today plus kg to go at the goal rate`() {
        // 6 kg to go at 0.5 kg/week is 12 weeks — 84 days past today.
        val progress = GoalProgress.planned(goal(), currentTrendKg = 86.0, today = today)

        assertEquals(today.plusWeeks(12), progress.plannedFinishDate)
        assertEquals(0.5, progress.plannedRateKgPerWeek, 1e-9)
    }

    /** A two-point trend whose slope over the trailing window is known exactly. */
    private fun trendFalling(fromKg: Double, toKg: Double, overDays: Long) =
        WeightTrend(
            listOf(
                WeightTrend.Point(today.minusDays(overDays), fromKg),
                WeightTrend.Point(today, toKg),
            ),
        )

    @Test
    fun `observed rate is the trend slope over the trailing 28 days`() {
        // Trend fell 2 kg across the 28 days ending today: 2 kg / 4 weeks = 0.5 kg/week.
        val trend = trendFalling(fromKg = 88.0, toKg = 86.0, overDays = 28)

        val progress = GoalProgress.forGoal(goal(), trend, today)

        assertEquals(0.5, progress.observedRateKgPerWeek!!, 1e-9)
    }

    @Test
    fun `the observed pace is withheld until 14 days of measurements exist`() {
        // Only 10 days of trend history — too little to read a pace from.
        val trend = trendFalling(fromKg = 86.5, toKg = 86.0, overDays = 10)

        val progress = GoalProgress.forGoal(goal(), trend, today)

        assertNull(progress.observedRateKgPerWeek)
        assertNull(progress.paceStatus)
        assertNull(progress.observedFinishDate)
    }

    /** A 28-day trend ending at 86 kg whose observed rate is exactly [ratePerWeek]. */
    private fun trendAtRate(ratePerWeek: Double) =
        trendFalling(fromKg = 86.0 + ratePerWeek * 4, toKg = 86.0, overDays = 28)

    @Test
    fun `pace is classified against the planned rate within a ±20% band`() {
        // Goal rate 0.5 kg/week → band edges at 0.4 and 0.6 kg/week.
        // Just outside the band is behind / ahead; just inside is on-pace.
        assertEquals(
            PaceStatus.BEHIND,
            GoalProgress.forGoal(goal(), trendAtRate(0.39), today).paceStatus,
        )
        assertEquals(
            PaceStatus.ON_PACE,
            GoalProgress.forGoal(goal(), trendAtRate(0.41), today).paceStatus,
        )
        assertEquals(
            PaceStatus.ON_PACE,
            GoalProgress.forGoal(goal(), trendAtRate(0.59), today).paceStatus,
        )
        assertEquals(
            PaceStatus.AHEAD,
            GoalProgress.forGoal(goal(), trendAtRate(0.61), today).paceStatus,
        )
    }

    @Test
    fun `the observed finish date projects the remaining loss at the observed rate`() {
        // 6 kg to go at an observed 0.5 kg/week is 12 weeks — 84 days past today.
        val progress = GoalProgress.forGoal(goal(), trendAtRate(0.5), today)

        assertEquals(today.plusWeeks(12), progress.observedFinishDate)
    }

    @Test
    fun `a non-falling trend is stalled with no observed finish date`() {
        // Trend drifted up over the window — no loss to project a finish from.
        val trend = trendFalling(fromKg = 85.0, toKg = 86.0, overDays = 28)

        val progress = GoalProgress.forGoal(goal(), trend, today)

        assertEquals(PaceStatus.STALLED, progress.paceStatus)
        assertNull(progress.observedFinishDate)
        // The (non-positive) rate itself is still reported.
        assertEquals(-0.25, progress.observedRateKgPerWeek!!, 1e-9)
    }

    @Test
    fun `a trend at or below the target reads as done with nothing to go`() {
        // Reached the target exactly: 0 kg to go, 100% complete, finishing today.
        val reached = GoalProgress.planned(goal(), currentTrendKg = 80.0, today = today)
        assertEquals(0.0, reached.kgToGo, 1e-9)
        assertEquals(100.0, reached.percentComplete, 1e-9)
        assertEquals(today, reached.plannedFinishDate)

        // Overshooting past the target never reports negative to-go or over 100%.
        val overshot = GoalProgress.planned(goal(), currentTrendKg = 78.0, today = today)
        assertEquals(0.0, overshot.kgToGo, 1e-9)
        assertEquals(100.0, overshot.percentComplete, 1e-9)
        assertEquals(today, overshot.plannedFinishDate)
    }
}
