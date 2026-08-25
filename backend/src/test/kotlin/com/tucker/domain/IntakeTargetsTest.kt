package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.LocalDate
import kotlin.test.assertEquals

class IntakeTargetsTest {

    private fun targets(
        calorieBudgetKcal: Double = 1900.0,
        proteinFloorG: Double = 170.0,
    ) = IntakeTargets(
        maintenance = Maintenance(2400.0, Maintenance.Basis.ADAPTIVE),
        calorieBudgetKcal = calorieBudgetKcal,
        proteinFloorG = proteinFloorG,
    )

    @Test
    fun `rejects a Calorie Budget of zero`() {
        // Nothing downstream treats a zero Budget as "no budget" — absence is the
        // whole targets object being absent, so a zero here would be a second,
        // weaker way of saying it that the day verdict and a Check both misread.
        val ex = assertThrows<IllegalArgumentException> { targets(calorieBudgetKcal = 0.0) }
        assert(ex.message!!.contains("calorieBudgetKcal", ignoreCase = true)) {
            "expected message to mention calorieBudgetKcal, was '${ex.message}'"
        }
    }

    @Test
    fun `rejects a negative Protein Floor`() {
        // A floor below zero is not a lenient floor, it is a nonsense one: the
        // remaining-protein figure would read as a surplus before a bite is eaten.
        val ex = assertThrows<IllegalArgumentException> { targets(proteinFloorG = -1.0) }
        assert(ex.message!!.contains("proteinFloorG", ignoreCase = true)) {
            "expected message to mention proteinFloorG, was '${ex.message}'"
        }
    }

    @Test
    fun `accepts a Protein Floor of zero, unlike the Calorie Budget`() {
        // The Floor alone may be zero: it is a floor, and no floor is a coherent
        // thing for a review to record. Check.of refuses one for its own reason —
        // it divides by it — and names this as what permits the row it guards against.
        assertEquals(0.0, targets(proteinFloorG = 0.0).proteinFloorG)
    }

    @Test
    fun `the Calorie Budget is Maintenance less the Goal's daily deficit`() {
        val targets = IntakeTargets.from(
            maintenance = Maintenance(2400.0, Maintenance.Basis.ADAPTIVE),
            goal = Goal(null, LocalDate.of(2026, 5, 1), 90.0, 80.0, 0.5, active = true),
            trendWeightKg = 85.0,
        )

        // 0.5 kg/week of fat is 7700 * 0.5 / 7 kcal a day off Maintenance.
        assertEquals(2400.0 - 550.0, targets.calorieBudgetKcal, 0.5)
    }

    @Test
    fun `in Maintenance Mode the Budget is Maintenance itself`() {
        // No Goal means no deficit to chase (ADR 0008), so the two figures coincide.
        val targets = IntakeTargets.from(
            maintenance = Maintenance(2400.0, Maintenance.Basis.ADAPTIVE),
            goal = null,
            trendWeightKg = 85.0,
        )

        assertEquals(2400.0, targets.calorieBudgetKcal, 1e-9)
    }

    @Test
    fun `the Protein Floor comes off the trend, with or without a Goal`() {
        // Decoupled from the Goal (ADR 0008), so it is 2 g/kg either way.
        val maintenance = Maintenance(2400.0, Maintenance.Basis.ADAPTIVE)
        val goal = Goal(null, LocalDate.of(2026, 5, 1), 90.0, 80.0, 0.5, active = true)

        assertEquals(170.0, IntakeTargets.from(maintenance, goal, 85.0).proteinFloorG, 1e-9)
        assertEquals(170.0, IntakeTargets.from(maintenance, null, 85.0).proteinFloorG, 1e-9)
    }
}
