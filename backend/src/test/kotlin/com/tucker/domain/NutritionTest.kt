package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNull

class NutritionTest {

    @Test
    fun `fromMacros computes calories per 100g using 4P + 4C + 9F`() {
        // 4 * 10 + 4 * 20 + 9 * 5 = 40 + 80 + 45 = 165 kcal /100g
        val n = Nutrition.fromMacros(proteinPer100g = 10.0, carbsPer100g = 20.0, fatPer100g = 5.0)
        assertEquals(165.0, n.caloriesPer100g, 1e-9)
        assertEquals(10.0, n.proteinPer100g)
        assertEquals(20.0, n.carbsPer100g)
        assertEquals(5.0, n.fatPer100g)
    }

    @Test
    fun `fibre counts 2 kcal per gram, so the protein wrap reads its label's 246 kcal`() {
        // 4 * 19.4 + 4 * 12.8 + 9 * 9.3 + 2 * 16.8 = 77.6 + 51.2 + 83.7 + 33.6 = 246.1 (ADR 0040)
        val wrap = Nutrition.fromMacros(
            proteinPer100g = 19.4,
            carbsPer100g = 12.8,
            fatPer100g = 9.3,
            fibrePer100g = 16.8,
        )
        assertEquals(246.1, wrap.caloriesPer100g, 1e-9)
        assertEquals(16.8, wrap.fibrePer100g)
    }

    @Test
    fun `a negative fibre is refused`() {
        assertThrows<IllegalArgumentException> {
            // Positive macros keep calories above zero, so only the fibre rule can refuse it.
            Nutrition.fromMacros(proteinPer100g = 10.0, carbsPer100g = 0.0, fatPer100g = 0.0, fibrePer100g = -0.1)
        }
    }

    @Test
    fun `macro energy shares split the Food's own calories by the Atwater factors`() {
        // Nutella: 25.2 kcal from protein, 230 from carbs, 278.1 from fat, of 533.3.
        val n = Nutrition.fromMacros(proteinPer100g = 6.3, carbsPer100g = 57.5, fatPer100g = 30.9)

        val shares = n.macroEnergyShares()

        assertEquals(0.047, shares.protein!!, 1e-3)
        assertEquals(0.431, shares.carbs!!, 1e-3)
        assertEquals(0.521, shares.fat!!, 1e-3)
    }

    @Test
    fun `a Food with no calories has no macro shares to state`() {
        // Calories are Atwater-derived, so no calories means no macros — black
        // coffee. Every share would divide by zero, which must not reach the wire.
        val blackCoffee = Nutrition.fromMacros(proteinPer100g = 0.0, carbsPer100g = 0.0, fatPer100g = 0.0)

        val shares = blackCoffee.macroEnergyShares()

        assertNull(shares.protein)
        assertNull(shares.carbs)
        assertNull(shares.fat)
    }

    @Test
    fun `a macro the source never supplied has no share, rather than a zero one`() {
        // Absent is never zero (ADR 0006): claiming a 0% carb share would assert
        // something nobody measured.
        val partial = Nutrition(caloriesPer100g = 200.0, proteinPer100g = 10.0, carbsPer100g = null, fatPer100g = 8.0)

        val shares = partial.macroEnergyShares()

        assertEquals(0.2, shares.protein!!, 1e-9)
        assertNull(shares.carbs)
        assertEquals(0.36, shares.fat!!, 1e-9)
    }

    @Test
    fun `fromMacros rejects negative macros`() {
        assertThrows<IllegalArgumentException> {
            Nutrition.fromMacros(proteinPer100g = -1.0, carbsPer100g = 0.0, fatPer100g = 0.0)
        }
        assertThrows<IllegalArgumentException> {
            Nutrition.fromMacros(proteinPer100g = 0.0, carbsPer100g = -1.0, fatPer100g = 0.0)
        }
        assertThrows<IllegalArgumentException> {
            Nutrition.fromMacros(proteinPer100g = 0.0, carbsPer100g = 0.0, fatPer100g = -1.0)
        }
    }
}
