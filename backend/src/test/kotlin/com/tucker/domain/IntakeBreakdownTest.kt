package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The rollup rules of an Intake Breakdown (CONTEXT.md, ADR 0026) over one day's
 * Entries. The window itself is the repository's job — these are the rules that
 * turn Entries into slices.
 */
class IntakeBreakdownTest {

    private val day = LocalDate.of(2026, 8, 27)

    private val chickenId = 3L
    private val riceId = 7L
    private val names = mapOf(chickenId to "Chicken breast", riceId to "Basmati rice")

    private fun weighed(foodId: Long, calories: Double, protein: Double, on: LocalDate = day) =
        WeighedEntry(id = null, loggedOn = on, foodId = foodId, grams = 100.0, calories = calories, protein = protein)

    private fun estimated(label: String, calories: Double, protein: Double? = null, on: LocalDate = day) =
        EstimatedEntry(id = null, loggedOn = on, label = label, calories = calories, protein = protein)

    private fun breakdownOf(vararg entries: Entry) =
        IntakeBreakdown.of(from = day, to = day, entries = entries.toList(), foodNames = names)

    @Test
    fun `a Food logged more than once in the window is one slice with its figures summed`() {
        val breakdown = breakdownOf(
            weighed(chickenId, calories = 200.0, protein = 37.0),
            weighed(chickenId, calories = 320.0, protein = 60.0),
        )

        assertEquals(1, breakdown.items.size)
        val chicken = breakdown.items.single()
        assertEquals(chickenId, chicken.foodId)
        assertEquals("Chicken breast", chicken.name)
        assertEquals(520.0, chicken.calories)
        assertEquals(97.0, chicken.protein)
    }

    @Test
    fun `an Estimated Entry slices by its label, merged case-insensitively and flagged an estimate`() {
        val breakdown = breakdownOf(
            estimated("Work canteen", calories = 400.0, protein = 20.0),
            estimated("  work CANTEEN  ", calories = 240.0, protein = 11.0),
        )

        val canteen = breakdown.items.single()
        assertNull(canteen.foodId)
        // The first label seen, trimmed — the User's own capitalisation, not a folded key.
        assertEquals("Work canteen", canteen.name)
        assertEquals(640.0, canteen.calories)
        assertEquals(31.0, canteen.protein)
        assertTrue(canteen.isEstimate)
    }

    @Test
    fun `a slice whose Entries all carry no protein figure reports no protein rather than zero`() {
        val breakdown = breakdownOf(
            estimated("Thai place", calories = 800.0, protein = null),
            estimated("thai place", calories = 300.0, protein = null),
        )

        assertNull(breakdown.items.single().protein)
    }

    @Test
    fun `a protein figure known to be zero is stated rather than treated as unknown`() {
        val breakdown = breakdownOf(estimated("Black coffee", calories = 4.0, protein = 0.0))

        assertEquals(0.0, breakdown.items.single().protein)
    }

    @Test
    fun `a slice mixing a known protein figure with an unknown one reports what is known`() {
        val breakdown = breakdownOf(
            estimated("Pub lunch", calories = 700.0, protein = 35.0),
            estimated("pub lunch", calories = 500.0, protein = null),
        )

        assertEquals(35.0, breakdown.items.single().protein)
    }

    @Test
    fun `the window total is the calories of every Entry in it, whatever they sliced into`() {
        val breakdown = breakdownOf(
            weighed(chickenId, calories = 520.0, protein = 97.0),
            weighed(riceId, calories = 350.0, protein = 8.0),
            estimated("Work canteen", calories = 640.0, protein = null),
        )

        assertEquals(1510.0, breakdown.totalCalories)
    }

    @Test
    fun `a slice's share is its calories over the window total, never over a target`() {
        val breakdown = breakdownOf(
            weighed(chickenId, calories = 520.0, protein = 97.0),
            weighed(riceId, calories = 1480.0, protein = 30.0),
        )

        val byName = breakdown.items.associateBy { it.name }
        assertEquals(0.26, byName.getValue("Chicken breast").share, 1e-9)
        assertEquals(0.74, byName.getValue("Basmati rice").share, 1e-9)
    }

    @Test
    fun `a window whose Entries carry no calories shares out zero rather than dividing by it`() {
        val breakdown = breakdownOf(estimated("Black coffee", calories = 0.0, protein = 0.0))

        assertEquals(0.0, breakdown.totalCalories)
        assertEquals(0.0, breakdown.items.single().share)
    }

    @Test
    fun `slices are ordered biggest first, whatever order the Entries were logged in`() {
        val breakdown = breakdownOf(
            weighed(riceId, calories = 350.0, protein = 8.0),
            estimated("Work canteen", calories = 640.0, protein = null),
            weighed(chickenId, calories = 520.0, protein = 97.0),
        )

        assertEquals(
            listOf("Work canteen", "Chicken breast", "Basmati rice"),
            breakdown.items.map { it.name },
        )
    }

    @Test
    fun `logged days counts the days in the window that carry an Entry, not the days it spans`() {
        val week = IntakeBreakdown.of(
            from = day.minusDays(6),
            to = day,
            entries = listOf(
                weighed(chickenId, calories = 520.0, protein = 97.0, on = day),
                weighed(riceId, calories = 350.0, protein = 8.0, on = day),
                estimated("Work canteen", calories = 640.0, protein = null, on = day.minusDays(3)),
            ),
            foodNames = names,
        )

        assertEquals(2, week.loggedDays)
    }

    @Test
    fun `a window with nothing logged is an empty breakdown rather than an absent one`() {
        val breakdown = breakdownOf()

        assertEquals(emptyList(), breakdown.items)
        assertEquals(0.0, breakdown.totalCalories)
        assertEquals(0, breakdown.loggedDays)
    }
}
