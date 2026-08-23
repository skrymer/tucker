package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/**
 * A Check (CONTEXT.md, ADR 0022) against the dev profile's targets: a 2492 kcal
 * Calorie Budget and a 170 g Protein Floor, which imply a pace of 6.8 g protein
 * per 100 kcal.
 */
class CheckTest {

    private val budgetKcal = 2492.0
    private val floorG = 170.0

    /** Nutella: 533 kcal and 6.3 g protein per 100 g — well below pace. */
    private val nutella = Nutrition.fromMacros(proteinPer100g = 6.3, carbsPer100g = 57.5, fatPer100g = 30.9)

    @Test
    fun `100 g costs a share of the Calorie Budget and returns a share of the Protein Floor`() {
        val check = Check.of(nutella, calorieBudgetKcal = budgetKcal, proteinFloorG = floorG)

        assertEquals(0.214, check.costSharePer100g, 0.001)
        assertEquals(0.037, check.returnSharePer100g, 0.001)
    }

    @Test
    fun `a Check sets the Food's protein per 100 kcal against the pace the targets imply`() {
        val check = Check.of(nutella, calorieBudgetKcal = budgetKcal, proteinFloorG = floorG)

        assertEquals(1.18, check.proteinPer100Kcal!!, 0.01)
        assertEquals(6.82, check.pace.gPer100Kcal, 0.01)
    }

    @Test
    fun `a Food below pace needs the difference made up elsewhere in the day`() {
        val check = Check.of(nutella, calorieBudgetKcal = budgetKcal, proteinFloorG = floorG)

        // 533 kcal must carry 36.4 g of protein to keep pace; Nutella brings 6.3.
        assertEquals(30.1, check.balanceProteinPer100gG, 0.1)
    }

    @Test
    fun `a Food above pace carries its own protein weight and needs nothing balanced`() {
        val tuna = Nutrition.fromMacros(proteinPer100g = 26.0, carbsPer100g = 0.0, fatPer100g = 4.7)

        val check = Check.of(tuna, calorieBudgetKcal = budgetKcal, proteinFloorG = floorG)

        assertEquals(0.0, check.balanceProteinPer100gG)
        // Nor does a whole day of it leave the floor short — it clears it outright.
        assertEquals(0.0, check.wholeDayProteinShortfallG)
    }

    @Test
    fun `a whole day of only this Food is stated in grams and in what it leaves short of the floor`() {
        val check = Check.of(nutella, calorieBudgetKcal = budgetKcal, proteinFloorG = floorG)

        // 2492 kcal buys 467 g of Nutella, which brings only 29 g of the 170 g floor.
        assertEquals(467.0, check.gramsInBudget!!, 1.0)
        assertEquals(140.6, check.wholeDayProteinShortfallG!!, 0.5)
    }

    @Test
    fun `a Food with no calories costs nothing and has no ratio or allowance to state`() {
        // Calories are Atwater-derived, so no calories means no macros either — a
        // diet drink or black coffee. Every ratio here would divide by zero.
        val dietDrink = Nutrition.fromMacros(proteinPer100g = 0.0, carbsPer100g = 0.0, fatPer100g = 0.0)

        val check = Check.of(dietDrink, calorieBudgetKcal = budgetKcal, proteinFloorG = floorG)

        assertEquals(0.0, check.costSharePer100g)
        assertEquals(0.0, check.returnSharePer100g)
        assertEquals(0.0, check.balanceProteinPer100gG)
        assertNull(check.proteinPer100Kcal, "no calories, so no protein-per-100-kcal ratio")
        assertNull(check.gramsInBudget, "no calories, so no amount of it exhausts the Budget")
        assertNull(check.wholeDayProteinShortfallG, "a whole day of only this Food is undefined")
    }

    @Test
    fun `a Check refuses a Calorie Budget of zero`() {
        // Every figure a Check states is a share of the Budget or the Floor, so a
        // zero for either is a divisor of zero. WeeklyReview permits it and the
        // adaptive engine never produces it, which leaves this the guard that
        // stops a hand-written row reaching the wire as an Infinity.
        assertFailsWith<IllegalArgumentException> {
            Check.of(nutella, calorieBudgetKcal = 0.0, proteinFloorG = floorG)
        }
    }

    @Test
    fun `a Check refuses a Protein Floor of zero`() {
        assertFailsWith<IllegalArgumentException> {
            Check.of(nutella, calorieBudgetKcal = budgetKcal, proteinFloorG = 0.0)
        }
    }
}
