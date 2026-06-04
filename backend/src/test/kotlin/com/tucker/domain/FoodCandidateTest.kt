package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertNull

class FoodCandidateTest {

    private fun candidate(
        proteinPer100g: Double? = 5.0,
        carbsPer100g: Double? = 5.0,
        fatPer100g: Double? = 5.0,
        name: String = "Skyr",
        barcode: String = "5701234567890",
    ) = FoodCandidate(
        name = name,
        barcode = barcode,
        proteinPer100g = proteinPer100g,
        carbsPer100g = carbsPer100g,
        fatPer100g = fatPer100g,
        statedEnergyKcalPer100g = 60.0,
        source = "Open Food Facts",
    )

    @Test
    fun `an absent macro stays absent rather than defaulting to zero`() {
        // Open Food Facts often omits a macro (e.g. fat). The Candidate must keep
        // it absent so the user is forced to fill it in — Atwater never runs on a
        // silent zero. See CONTEXT.md and ADR 0006.
        val candidate = FoodCandidate(
            name = "Sparkling water",
            barcode = "5701234567890",
            proteinPer100g = 0.0,
            carbsPer100g = 0.0,
            fatPer100g = null,
            statedEnergyKcalPer100g = 0.0,
            source = "Open Food Facts",
        )

        assertNull(candidate.fatPer100g)
    }

    @Test
    fun `rejects a negative macro`() {
        assertThrows<IllegalArgumentException> { candidate(proteinPer100g = -1.0) }
        assertThrows<IllegalArgumentException> { candidate(carbsPer100g = -1.0) }
        assertThrows<IllegalArgumentException> { candidate(fatPer100g = -1.0) }
    }

    @Test
    fun `rejects a blank name`() {
        assertThrows<IllegalArgumentException> { candidate(name = " ") }
    }
}
