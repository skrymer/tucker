package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.LocalDate
import kotlin.test.assertEquals

class EntryTest {

    private val today = LocalDate.of(2026, 5, 1)

    @Test
    fun `a weighed Entry of a Food that carries nothing is logged, not refused`() {
        // Black coffee, a diet drink, a zero-calorie sweetener: real Foods with
        // real weights whose macros are all zero. Calories and protein floor at
        // zero rather than needing to clear it — a Food is refused for being
        // *negative*, never for being weightless in energy.
        val entry = WeighedEntry(
            id = null,
            loggedOn = today,
            foodId = 1,
            grams = 250.0,
            calories = 0.0,
            protein = 0.0,
        )

        assertEquals(0.0, entry.calories)
        assertEquals(0.0, entry.protein)
    }

    @Test
    fun `a weighed Entry of zero grams is refused`() {
        // Weight is the whole point of a weighed Entry — nothing was eaten, and
        // an Entry saying so would still count as a logged day to the engine.
        val ex = assertThrows<IllegalArgumentException> {
            WeighedEntry(
                id = null,
                loggedOn = today,
                foodId = 1,
                grams = 0.0,
                calories = 0.0,
                protein = 0.0,
            )
        }
        assert(ex.message!!.contains("grams", ignoreCase = true)) {
            "expected message to mention grams, was '${ex.message}'"
        }
    }

    private val rice = Food.plain(
        id = 1L,
        name = "Rice",
        barcode = null,
        nutrition = Nutrition(caloriesPer100g = 130.0, proteinPer100g = 2.7, carbsPer100g = null, fatPer100g = null),
    )

    @Test
    fun `a weighed Entry dated the day after tomorrow is refused`() {
        // Tomorrow is the furthest ahead an Entry can be dated (ADR 0035).
        val ex = assertThrows<IllegalArgumentException> {
            WeighedEntry.log(today.plusDays(2), rice, grams = 100.0, today = today)
        }
        assert(ex.message!!.contains("tomorrow", ignoreCase = true)) {
            "expected message to mention tomorrow, was '${ex.message}'"
        }
    }

    @Test
    fun `a weighed Entry dated tomorrow is logged on tomorrow`() {
        val entry = WeighedEntry.log(today.plusDays(1), rice, grams = 100.0, today = today)

        assertEquals(today.plusDays(1), entry.loggedOn)
        assertEquals(130.0, entry.calories)
    }

    @Test
    fun `an estimated Entry dated the day after tomorrow is refused`() {
        val ex = assertThrows<IllegalArgumentException> {
            EstimatedEntry.log(today.plusDays(2), "Café dinner", calories = 800.0, protein = null, today = today)
        }
        assert(ex.message!!.contains("tomorrow", ignoreCase = true)) {
            "expected message to mention tomorrow, was '${ex.message}'"
        }
    }

    @Test
    fun `an estimated Entry dated tomorrow is logged on tomorrow`() {
        val entry =
            EstimatedEntry.log(today.plusDays(1), "Café dinner", calories = 800.0, protein = null, today = today)

        assertEquals(today.plusDays(1), entry.loggedOn)
        assertEquals("Café dinner", entry.label)
        assertEquals(800.0, entry.calories)
        assertEquals(null, entry.protein)
    }
}
