package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNull

class GoalTest {

    private val today = LocalDate.of(2026, 5, 1)
    private val startedOn = today

    private fun goalWithRate(rateKgPerWeek: Double) = Goal(
        id = null,
        startedOn = startedOn,
        startWeightKg = 90.0,
        targetWeightKg = 80.0,
        rateKgPerWeek = rateKgPerWeek,
        active = true,
    )

    @Test
    fun `started rejects a start date in the future`() {
        val ex = assertThrows<IllegalArgumentException> {
            Goal.started(
                startedOn = today.plusDays(1),
                startWeightKg = 90.0,
                targetWeightKg = 80.0,
                rateKgPerWeek = 0.5,
                today = today,
            )
        }
        assert(ex.message!!.contains("future", ignoreCase = true)) {
            "expected message to mention future, was '${ex.message}'"
        }
    }

    @Test
    fun `started makes an unsaved, active, never-reached Goal from today`() {
        val goal = Goal.started(
            startedOn = today,
            startWeightKg = 90.0,
            targetWeightKg = 80.0,
            rateKgPerWeek = 0.5,
            today = today,
        )
        assertEquals(today, goal.startedOn)
        assert(goal.active) { "a Goal being set now is the active one" }
        assertNull(goal.id, "a Goal being set now is not yet saved")
        assertEquals(90.0, goal.startWeightKg)
        assertEquals(80.0, goal.targetWeightKg)
        assertEquals(0.5, goal.rateKgPerWeek)
        assertNull(goal.reachedOn, "a Goal being set now has not been reached")
    }

    @Test
    fun `rejects a rate below the 0_05 kg per week floor`() {
        val ex = assertThrows<IllegalArgumentException> { goalWithRate(0.04) }
        assert(ex.message!!.contains("rateKgPerWeek", ignoreCase = true)) {
            "expected message to mention rateKgPerWeek, was '${ex.message}'"
        }
    }

    @Test
    fun `accepts the 0_05 kg per week floor`() {
        val goal = goalWithRate(0.05)
        assertEquals(0.05, goal.rateKgPerWeek)
    }

    @Test
    fun `rejects a rate above the 1_5 kg per week ceiling`() {
        val ex = assertThrows<IllegalArgumentException> { goalWithRate(1.51) }
        assert(ex.message!!.contains("rateKgPerWeek", ignoreCase = true)) {
            "expected message to mention rateKgPerWeek, was '${ex.message}'"
        }
    }

    @Test
    fun `accepts the 1_5 kg per week ceiling`() {
        val goal = goalWithRate(1.5)
        assertEquals(1.5, goal.rateKgPerWeek)
    }

    @Test
    fun `stamps reachedOn when the trend first crosses the target`() {
        val goal = goalWithRate(0.5)
        val reachedOn = LocalDate.of(2026, 6, 5)

        val reached = goal.markReachedIfCrossed(trendWeightKg = 80.0, on = reachedOn)

        assertEquals(reachedOn, reached.reachedOn)
    }

    @Test
    fun `keeps the original reachedOn for an already-reached Goal still below target`() {
        val firstReached = LocalDate.of(2026, 6, 5)
        val reached = goalWithRate(0.5).copy(reachedOn = firstReached)

        // A later weigh-in still below target must not restamp to the new date.
        val stillReached =
            reached.markReachedIfCrossed(trendWeightKg = 79.0, on = LocalDate.of(2026, 6, 12))

        assertEquals(firstReached, stillReached.reachedOn)
    }

    @Test
    fun `leaves reachedOn null while the trend is still above target`() {
        val goal = goalWithRate(0.5)

        val notReached = goal.markReachedIfCrossed(trendWeightKg = 80.1, on = LocalDate.of(2026, 6, 5))

        assertEquals(null, notReached.reachedOn)
    }

    @Test
    fun `rejects a target weight at or above the start weight`() {
        val ex = assertThrows<IllegalArgumentException> {
            Goal(
                id = null,
                startedOn = startedOn,
                startWeightKg = 80.0,
                targetWeightKg = 90.0,
                rateKgPerWeek = 0.5,
                active = true,
            )
        }
        assert(ex.message!!.contains("below the start weight", ignoreCase = true)) {
            "expected message to mention the target-below-start rule, was '${ex.message}'"
        }
    }

    @Test
    fun `rejects a start weight of zero, naming the start weight`() {
        // Zero is refused as a *start* weight rather than falling through to
        // whichever later rule happens to trip on it — the message is what says
        // which figure the caller got wrong.
        val ex = assertThrows<IllegalArgumentException> {
            Goal(
                id = null,
                startedOn = startedOn,
                startWeightKg = 0.0,
                targetWeightKg = 0.0,
                rateKgPerWeek = 0.5,
                active = true,
            )
        }
        assert(ex.message!!.contains("startWeightKg", ignoreCase = true)) {
            "expected message to mention startWeightKg, was '${ex.message}'"
        }
    }

    @Test
    fun `rejects a target weight of zero`() {
        val ex = assertThrows<IllegalArgumentException> {
            Goal(
                id = null,
                startedOn = startedOn,
                startWeightKg = 90.0,
                targetWeightKg = 0.0,
                rateKgPerWeek = 0.5,
                active = true,
            )
        }
        assert(ex.message!!.contains("targetWeightKg", ignoreCase = true)) {
            "expected message to mention targetWeightKg, was '${ex.message}'"
        }
    }

    @Test
    fun `rejects a target weight equal to the start weight`() {
        // Nothing to lose is not a weight-loss Goal — the target has to be below
        // the start, not merely not above it.
        val ex = assertThrows<IllegalArgumentException> {
            Goal(
                id = null,
                startedOn = startedOn,
                startWeightKg = 80.0,
                targetWeightKg = 80.0,
                rateKgPerWeek = 0.5,
                active = true,
            )
        }
        assert(ex.message!!.contains("below the start weight", ignoreCase = true)) {
            "expected message to mention the target-below-start rule, was '${ex.message}'"
        }
    }

    @Test
    fun `the plan runs from the start weight at the chosen rate, and stops at the target`() {
        val goal = goalWithRate(0.5)

        assertEquals(90.0, goal.plannedWeightOn(startedOn))
        assertEquals(89.5, goal.plannedWeightOn(startedOn.plusDays(7)))
        // Twenty kilos at half a kilo a week is twenty weeks; the plan is to reach
        // the target, and there is none below it.
        assertEquals(80.0, goal.plannedWeightOn(startedOn.plusWeeks(20)))
        assertEquals(80.0, goal.plannedWeightOn(startedOn.plusWeeks(52)))
        assertNull(goal.plannedWeightOn(startedOn.minusDays(1)))
    }

    @Test
    fun `a plan never rises, whatever rate the Goal was set at`() {
        // The Weight Timeline's clamp takes the first day under the plot's floor and
        // the last over its ceiling as the ones nearest the plot, which holds only
        // for a plan that never turns back. What makes it hold is the init block: a
        // rate above zero, and a target below the start weight.
        for (rate in listOf(Goal.MIN_RATE_KG_PER_WEEK, 0.5, Goal.MAX_RATE_KG_PER_WEEK)) {
            val plan = (0L..200L).map { goalWithRate(rate).plannedWeightOn(startedOn.plusDays(it))!! }

            assertEquals(plan.sortedDescending(), plan, "a plan at $rate kg/week turned back")
        }
    }
}
