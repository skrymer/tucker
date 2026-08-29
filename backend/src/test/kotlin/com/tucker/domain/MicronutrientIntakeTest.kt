package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals

/**
 * The **Micronutrient Intake** read in its slice-1 shape: how much of a window's
 * calories could contribute micronutrients at all, and what is left to match
 * (ADR 0027). No nutrient figures — those are issue #279.
 *
 * The queue is the **Intake Breakdown** filtered to the unmatched, so it shares that
 * ranking and that denominator rather than inventing a second pair.
 */
class MicronutrientIntakeTest {

    private val day = LocalDate.of(2026, 8, 27)

    @Test
    fun `an unmatched Food is queued with its share of the window`() {
        val chicken = food(id = 1, name = "Chicken breast")
        val entries = listOf(WeighedEntry.log(day, chicken, grams = 200.0))

        val intake = MicronutrientIntake.of(breakdown(entries, chicken), mapOf(1L to chicken))

        assertEquals(
            listOf(UnmatchedFood(foodId = 1, name = "Chicken breast", calories = 312.8, share = 1.0)),
            intake.unmatched,
            "there is one Food, it is all of the window's calories, and nothing is borrowed " +
                "from it yet — so it is the whole queue",
        )
    }

    @Test
    fun `a window with nothing logged says so, rather than looking fully covered`() {
        val intake = MicronutrientIntake.of(breakdown(entries = emptyList()), foods = emptyMap())

        assertEquals(
            0.0,
            intake.totalCalories,
            "an empty queue and zero coverage read identically to a week where everything " +
                "is matched, so the window's own total is what tells them apart",
        )
        assertEquals(
            0.0,
            intake.coverage,
            "and coverage is zero rather than NaN: nothing over nothing is what dividing " +
                "by the window's own total would give, and NaN serialises as null",
        )
    }

    @Test
    fun `a Recipe is never queued, because it is never matched`() {
        val bolognese = recipe(id = 3, name = "Bolognese")
        val entries = listOf(WeighedEntry.log(day, bolognese, grams = 300.0))

        val intake = MicronutrientIntake.of(breakdown(entries, bolognese), mapOf(3L to bolognese))

        assertEquals(
            emptyList(),
            intake.unmatched,
            "a Recipe rolls its micronutrients up from whichever ingredients are matched " +
                "(CONTEXT.md), so offering it as something to match would be an unusable tap",
        )
        assertEquals(
            0.0,
            intake.coverage,
            "and it contributes nothing in this slice — issue #280 is what makes it count " +
                "fractionally, by how much of it came from matched ingredients",
        )
    }

    @Test
    fun `an Estimated Entry contributes nothing and is not something to match`() {
        val chicken = food(id = 1, name = "Chicken breast", referenceFoodId = 42)
        val entries = listOf(
            WeighedEntry.log(day, chicken, grams = 200.0),
            EstimatedEntry(id = null, loggedOn = day, label = "Work canteen", calories = 312.8, protein = null),
        )

        val intake = MicronutrientIntake.of(breakdown(entries, chicken), mapOf(1L to chicken))

        assertEquals(
            0.5,
            intake.coverage,
            "an Estimated Entry has no Food, so nothing can ever be borrowed for it — half " +
                "this window is unaccounted for permanently, not pending a tap",
        )
        assertEquals(
            emptyList(),
            intake.unmatched,
            "and it is not queued: a queue is a list of things to do, and there is nothing " +
                "to do about a meal that was never weighed",
        )
    }

    @Test
    fun `coverage is the share of the window's calories that could contribute at all`() {
        val chicken = food(id = 1, name = "Chicken breast", referenceFoodId = 42)
        val rice = food(id = 2, name = "Jasmine rice")
        val entries = listOf(
            WeighedEntry.log(day, chicken, grams = 200.0),
            WeighedEntry.log(day, rice, grams = 200.0),
        )

        val intake = MicronutrientIntake.of(
            breakdown(entries, chicken, rice),
            mapOf(1L to chicken, 2L to rice),
        )

        assertEquals(
            0.5,
            intake.coverage,
            "half the window came from a Food with a Reference Food behind it, so half of " +
                "it can supply a figure and the other half is honestly unaccounted for",
        )
    }

    private fun food(id: Long, name: String, referenceFoodId: Long? = null) = Food.plain(
        id = id,
        name = name,
        barcode = null,
        nutrition = Nutrition.fromMacros(proteinPer100g = 31.0, carbsPer100g = 0.0, fatPer100g = 3.6),
    ).copy(referenceFoodId = referenceFoodId)

    private fun recipe(id: Long, name: String) = Food(
        id = id,
        name = name,
        kind = FoodKind.RECIPE,
        barcode = null,
        nutrition = Nutrition.fromMacros(proteinPer100g = 8.0, carbsPer100g = 12.0, fatPer100g = 5.0),
        cookedWeightG = 900.0,
    )

    private fun breakdown(entries: List<Entry>, vararg foods: Food) = IntakeBreakdown.of(
        from = day,
        to = day,
        entries = entries,
        foodNames = foods.associate { it.id!! to it.name },
    )
}
