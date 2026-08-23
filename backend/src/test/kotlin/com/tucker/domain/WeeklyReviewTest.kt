package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.LocalDate
import kotlin.test.assertEquals

class WeeklyReviewTest {

    private fun review(
        trendWeightKg: Double = 85.0,
        calorieBudgetKcal: Double = 1900.0,
        proteinFloorG: Double = 170.0,
    ) = WeeklyReview(
        id = null,
        reviewedOn = LocalDate.of(2026, 6, 1),
        trendWeightKg = trendWeightKg,
        maintenance = Maintenance(2400.0, Maintenance.Basis.ADAPTIVE),
        calorieBudgetKcal = calorieBudgetKcal,
        proteinFloorG = proteinFloorG,
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
    fun `rejects a Calorie Budget of zero`() {
        // Nothing downstream treats a zero Budget as "no budget" — the day would
        // read as over budget on the first Entry, and a Check divides by it.
        val ex = assertThrows<IllegalArgumentException> { review(calorieBudgetKcal = 0.0) }
        assert(ex.message!!.contains("calorieBudgetKcal", ignoreCase = true)) {
            "expected message to mention calorieBudgetKcal, was '${ex.message}'"
        }
    }

    @Test
    fun `accepts a Protein Floor of zero, unlike the other two figures`() {
        // The Floor alone may be zero: it is a floor, and no floor is a coherent
        // thing for a review to record. Check.of refuses one for its own reason —
        // it divides by it — and names this as what permits the row it guards against.
        assertEquals(0.0, review(proteinFloorG = 0.0).proteinFloorG)
    }
}
