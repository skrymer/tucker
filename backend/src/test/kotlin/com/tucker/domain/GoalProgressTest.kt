package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals

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
