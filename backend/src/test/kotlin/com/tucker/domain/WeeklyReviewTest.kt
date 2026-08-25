package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.LocalDate
import kotlin.test.assertNull

class WeeklyReviewTest {

    private fun review(
        trendWeightKg: Double = 85.0,
        intakeTargets: IntakeTargets? = IntakeTargets(
            maintenance = Maintenance(2400.0, Maintenance.Basis.ADAPTIVE),
            calorieBudgetKcal = 1900.0,
            proteinFloorG = 170.0,
        ),
    ) = WeeklyReview(
        id = null,
        reviewedOn = LocalDate.of(2026, 6, 1),
        trendWeightKg = trendWeightKg,
        intakeTargets = intakeTargets,
    )

    @Test
    fun `rejects a trend weight of zero`() {
        // A review is a historical record that later reviews and Goal progress
        // read back, so a nobody-shaped one has to be refused as it is written.
        val ex = assertThrows<IllegalArgumentException> { review(trendWeightKg = 0.0) }
        assert(ex.message!!.contains("trendWeightKg", ignoreCase = true)) {
            "expected message to mention trendWeightKg, was '${ex.message}'"
        }
    }

    @Test
    fun `records a Trend Weight with no Intake Targets`() {
        // The review's other job (CONTEXT.md — Weekly Review): with Calorie
        // Tracking off there is no Budget to publish, and the weekly dated
        // reading of where the trend is going is the whole of the record.
        assertNull(review(intakeTargets = null).intakeTargets)
    }
}
