package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.LocalDate
import kotlin.test.assertEquals

class GoalTest {

    private val startedOn = LocalDate.of(2026, 5, 1)

    private fun goalWithRate(rateKgPerWeek: Double) = Goal(
        id = null,
        startedOn = startedOn,
        startWeightKg = 90.0,
        targetWeightKg = 80.0,
        rateKgPerWeek = rateKgPerWeek,
        active = true,
    )

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
}
