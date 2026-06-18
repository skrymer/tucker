package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BudgetProjectionTest {

    private val date = LocalDate.of(2026, 6, 18)

    /** A plain food at 100 kcal / 100 g (so grams and calories are interchangeable). */
    private val food = Food.plain(
        id = 1L,
        name = "Rice",
        barcode = null,
        nutrition = Nutrition(caloriesPer100g = 100.0, proteinPer100g = 2.0, carbsPer100g = null, fatPer100g = null),
    )

    @Test
    fun `an entry that pushes the day past the budget would exceed it`() {
        // 1,500 kcal already logged against a 2,000 budget — 500 to spare.
        val log = DailyLog(date, listOf(EstimatedEntry(null, date, "lunch out", 1500.0, null)))

        // A 600 g serving = 600 kcal → projected 2,100, over the 2,000 budget.
        val projection = log.project(
            WeighedEntry.log(date, food, grams = 600.0),
            calorieBudgetKcal = 2000.0,
            proteinFloorG = 150.0,
        )

        assertTrue(projection.wouldExceedBudget)
    }

    @Test
    fun `an entry that stays within the budget would not exceed it`() {
        val log = DailyLog(date, listOf(EstimatedEntry(null, date, "lunch out", 1500.0, null)))

        // A 400 g serving = 400 kcal → projected 1,900, under the 2,000 budget.
        val projection = log.project(
            WeighedEntry.log(date, food, grams = 400.0),
            calorieBudgetKcal = 2000.0,
            proteinFloorG = 150.0,
        )

        assertFalse(projection.wouldExceedBudget)
        assertEquals(1900.0, projection.projectedCaloriesConsumed)
    }

    @Test
    fun `an over-budget projection reports how far over the budget it lands`() {
        val log = DailyLog(date, listOf(EstimatedEntry(null, date, "lunch out", 1500.0, null)))

        val projection = log.project(
            WeighedEntry.log(date, food, grams = 600.0),
            calorieBudgetKcal = 2000.0,
            proteinFloorG = 150.0,
        )

        assertEquals(2100.0, projection.projectedCaloriesConsumed)
        assertEquals(100.0, projection.overByKcal)
    }

    @Test
    fun `a within-budget projection has no over-by figure`() {
        val log = DailyLog(date, listOf(EstimatedEntry(null, date, "lunch out", 1500.0, null)))

        val projection = log.project(
            WeighedEntry.log(date, food, grams = 400.0),
            calorieBudgetKcal = 2000.0,
            proteinFloorG = 150.0,
        )

        assertNull(projection.overByKcal)
    }

    @Test
    fun `with no budget yet there is nothing to exceed`() {
        val log = DailyLog(date, listOf(EstimatedEntry(null, date, "lunch out", 1500.0, null)))

        // Before the first review there is no Calorie Budget — report the total only.
        val projection = log.project(
            WeighedEntry.log(date, food, grams = 600.0),
            calorieBudgetKcal = null,
            proteinFloorG = null,
        )

        assertFalse(projection.wouldExceedBudget)
        assertEquals(2100.0, projection.projectedCaloriesConsumed)
        assertNull(projection.overByKcal)
    }

    @Test
    fun `an entry landing exactly on the budget does not exceed it`() {
        val log = DailyLog(date, listOf(EstimatedEntry(null, date, "lunch out", 1500.0, null)))

        // A 500 g serving = 500 kcal → projected exactly 2,000: at budget is on-target, not over.
        val projection = log.project(
            WeighedEntry.log(date, food, grams = 500.0),
            calorieBudgetKcal = 2000.0,
            proteinFloorG = 150.0,
        )

        assertFalse(projection.wouldExceedBudget)
        assertNull(projection.overByKcal)
    }
}
