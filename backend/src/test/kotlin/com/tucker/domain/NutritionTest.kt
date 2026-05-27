package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals

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
