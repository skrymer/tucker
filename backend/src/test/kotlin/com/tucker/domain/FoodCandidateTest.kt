package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class FoodCandidateTest {

    private fun candidate(
        proteinPer100g: Double? = 5.0,
        carbsPer100g: Double? = 5.0,
        fatPer100g: Double? = 5.0,
        name: String = "Skyr",
    ) = FoodCandidate(
        name = name,
        barcode = "5701234567890",
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
    fun `derives Atwater nutrition once every macro is present`() {
        // 4 * 5 + 4 * 5 + 9 * 5 = 85 kcal /100g.
        val nutrition = candidate().atwaterNutrition()

        assertEquals(85.0, nutrition!!.caloriesPer100g, 1e-9)
        assertEquals(5.0, nutrition.proteinPer100g)
    }

    @Test
    fun `has no Atwater nutrition while any macro is absent`() {
        // Each arm on its own: one missing macro is enough, and none of the three
        // may be quietly read as zero (ADR 0006).
        assertNull(candidate(proteinPer100g = null).atwaterNutrition())
        assertNull(candidate(carbsPer100g = null).atwaterNutrition())
        assertNull(candidate(fatPer100g = null).atwaterNutrition())
    }

    @Test
    fun `rejects a negative macro`() {
        assertThrows<IllegalArgumentException> { candidate(proteinPer100g = -1.0) }
        assertThrows<IllegalArgumentException> { candidate(carbsPer100g = -1.0) }
        assertThrows<IllegalArgumentException> { candidate(fatPer100g = -1.0) }
    }

    @Test
    fun `rejects a negative fibre`() {
        assertThrows<IllegalArgumentException> { candidate().copy(fibrePer100g = -1.0) }
    }

    @Test
    fun `rejects a negative alcohol`() {
        assertThrows<IllegalArgumentException> { candidate().copy(alcoholPer100g = -1.0) }
    }

    @Test
    fun `rejects a blank name`() {
        assertThrows<IllegalArgumentException> { candidate(name = " ") }
    }

    @Test
    fun `the wrap's carbs with its fibre folded in are offered without the fibre`() {
        // The wrap's real OFF record: carbs as given derive ~312 kcal against a stated
        // 246; carbs minus fibre derive ~245.6, within 5 % of it.
        val wrap = candidate(
            proteinPer100g = 19.4285714285714,
            carbsPer100g = 29.4285714285714,
            fatPer100g = 9.28571428571429,
        ).copy(fibrePer100g = 16.7142857142857, statedEnergyKcalPer100g = 246.0)

        assertEquals(12.7142857142857, assertNotNull(wrap.adjustedCarbsPer100g), 1e-9)
    }

    @Test
    fun `the carbs offered are the adjusted ones when the fibre was folded in`() {
        val wrap = candidate(
            proteinPer100g = 19.4285714285714,
            carbsPer100g = 29.4285714285714,
            fatPer100g = 9.28571428571429,
        ).copy(fibrePer100g = 16.7142857142857, statedEnergyKcalPer100g = 246.0)

        assertEquals(12.7142857142857, assertNotNull(wrap.offeredCarbsPer100g), 1e-9)
    }

    @Test
    fun `the carbs offered are the Provider's when nothing was folded in`() {
        val wrap = candidate(proteinPer100g = 19.4, carbsPer100g = 12.8, fatPer100g = 9.3)
            .copy(fibrePer100g = 16.8, statedEnergyKcalPer100g = 246.0)

        assertEquals(12.8, wrap.offeredCarbsPer100g)
    }

    @Test
    fun `carbs that already match the stated energy are not adjusted`() {
        // The wrap as its label states it: carbs exclude fibre, and derive 246.1 kcal.
        val wrap = candidate(proteinPer100g = 19.4, carbsPer100g = 12.8, fatPer100g = 9.3)
            .copy(fibrePer100g = 16.8, statedEnergyKcalPer100g = 246.0)

        assertNull(wrap.adjustedCarbsPer100g)
    }

    @Test
    fun `carbs are not adjusted without a stated energy to arbitrate`() {
        val wrap = candidate(
            proteinPer100g = 19.4285714285714,
            carbsPer100g = 29.4285714285714,
            fatPer100g = 9.28571428571429,
        ).copy(fibrePer100g = 16.7142857142857, statedEnergyKcalPer100g = null)

        assertNull(wrap.adjustedCarbsPer100g)
    }

    @Test
    fun `carbs are not adjusted when taking the fibre out does not reach the stated energy either`() {
        // ~312 kcal as given, ~245.6 without the fibre: neither is near a stated 400.
        val wrap = candidate(
            proteinPer100g = 19.4285714285714,
            carbsPer100g = 29.4285714285714,
            fatPer100g = 9.28571428571429,
        ).copy(fibrePer100g = 16.7142857142857, statedEnergyKcalPer100g = 400.0)

        assertNull(wrap.adjustedCarbsPer100g)
    }

    @Test
    fun `more fibre than carbs cannot have been folded into them`() {
        // Carbs minus fibre would be negative, which no reading of the carbs can be.
        val bran = candidate(proteinPer100g = 14.0, carbsPer100g = 5.0, fatPer100g = 4.0)
            .copy(fibrePer100g = 40.0, statedEnergyKcalPer100g = 300.0)

        assertNull(bran.adjustedCarbsPer100g)
    }

    @Test
    fun `a drink's folded-in fibre is caught by counting its alcohol in the energy`() {
        // 4 × (10 − 5) + 2 × 5 + 7 × 5 = 65, the stated energy; carbs as given read 95.
        // Leave the alcohol out and the adjusted reading is 30, which matches nothing.
        val drink = candidate(proteinPer100g = 0.0, carbsPer100g = 10.0, fatPer100g = 0.0)
            .copy(fibrePer100g = 5.0, alcoholPer100g = 5.0, statedEnergyKcalPer100g = 65.0)

        assertEquals(5.0, assertNotNull(drink.adjustedCarbsPer100g), 1e-9)
    }

    @Test
    fun `an adjusted reading exactly the tolerance from the stated energy is accepted`() {
        // 4 × (57.5 − 10) + 2 × 10 = 210: 5 % over a stated 200. As given: 250.
        val atTheEdge = candidate(proteinPer100g = 0.0, carbsPer100g = 57.5, fatPer100g = 0.0)
            .copy(fibrePer100g = 10.0, statedEnergyKcalPer100g = 200.0)

        assertEquals(0.05, FoodCandidate.FIBRE_FOLDED_TOLERANCE)
        assertEquals(47.5, assertNotNull(atTheEdge.adjustedCarbsPer100g), 1e-9)
    }

    @Test
    fun `an adjusted reading just past the tolerance from the stated energy is not accepted`() {
        // 4 × (57.5125 − 10) + 2 × 10 = 210.05: 5.025 % over a stated 200.
        val pastTheEdge = candidate(proteinPer100g = 0.0, carbsPer100g = 57.5125, fatPer100g = 0.0)
            .copy(fibrePer100g = 10.0, statedEnergyKcalPer100g = 200.0)

        assertNull(pastTheEdge.adjustedCarbsPer100g)
    }

    @Test
    fun `carbs are not adjusted without a fibre figure`() {
        val wrap = candidate(
            proteinPer100g = 19.4285714285714,
            carbsPer100g = 29.4285714285714,
            fatPer100g = 9.28571428571429,
        ).copy(fibrePer100g = null, statedEnergyKcalPer100g = 246.0)

        assertNull(wrap.adjustedCarbsPer100g)
    }

    @Test
    fun `a beer whose carbs as given match its stated energy, alcohol counted, is not adjusted`() {
        // Heineken: 4 × 0.5 + 4 × 3.2 + 2 × 0.3 + 7 × 3.945 = 43.0 against a stated 42.
        val beer = candidate(proteinPer100g = 0.5, carbsPer100g = 3.2, fatPer100g = 0.0)
            .copy(fibrePer100g = 0.3, alcoholPer100g = 3.945, statedEnergyKcalPer100g = 42.0)

        assertNull(beer.adjustedCarbsPer100g)
    }

    @Test
    fun `carbs that are all folded-in fibre are offered as zero`() {
        // 4 × 10 + 4 × (10 − 10) + 2 × 10 = 60, the stated energy; carbs as given read 100.
        val fibreOnly = candidate(proteinPer100g = 10.0, carbsPer100g = 10.0, fatPer100g = 0.0)
            .copy(fibrePer100g = 10.0, statedEnergyKcalPer100g = 60.0)

        assertEquals(0.0, fibreOnly.adjustedCarbsPer100g)
    }

    @Test
    fun `carbs are not adjusted when the Provider states none`() {
        val noCarbs = candidate(proteinPer100g = 10.0, carbsPer100g = null, fatPer100g = 0.0)
            .copy(fibrePer100g = 10.0, statedEnergyKcalPer100g = 60.0)

        assertNull(noCarbs.adjustedCarbsPer100g)
    }

    @Test
    fun `a US-style record's fibre, counted inside its carbs at 4 kcal per gram, is caught too`() {
        // The label's 298 = 4 × 10 + 4 × 60 + 9 × 2: fibre counted inside the carbs.
        // Tucker as given reads 358 and carbs minus fibre 238; neither is within 5 %.
        val cereal = candidate(proteinPer100g = 10.0, carbsPer100g = 60.0, fatPer100g = 2.0)
            .copy(fibrePer100g = 30.0, statedEnergyKcalPer100g = 298.0)

        assertEquals(30.0, cereal.adjustedCarbsPer100g)
    }
}
