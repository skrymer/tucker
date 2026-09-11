package com.tucker.api

import com.tucker.domain.EstimatedEntry
import com.tucker.domain.WeighedEntry
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * How an Entry names itself on the wire. The name is stated by the backend rather
 * than reassembled by the client, so the arm an Entry belongs to decides it here.
 */
class EntryResponseTest {

    private val day = LocalDate.of(2026, 5, 22)

    @Test
    fun `a weighed Entry is named by its Food`() {
        val entry = WeighedEntry(
            id = 1, loggedOn = day, foodId = 5, grams = 120.0, calories = 118.0, protein = 1.3,
        )

        assertEquals("Banana", entry.toResponse(foodName = "Banana").name)
    }

    @Test
    fun `an estimated Entry is named by its label`() {
        val entry = EstimatedEntry(
            id = 2, loggedOn = day, label = "Cafe lunch", calories = 600.0, protein = null,
        )

        assertEquals("Cafe lunch", entry.toResponse(foodName = null).name)
    }

    @Test
    fun `an estimated Entry is named without the spacing its label was typed with`() {
        val entry = EstimatedEntry(
            id = 4, loggedOn = day, label = "  Cafe lunch ", calories = 600.0, protein = null,
        )

        assertEquals("Cafe lunch", entry.toResponse(foodName = null).name)
    }

    @Test
    fun `a weighed Entry whose Food cannot be resolved is still named`() {
        val entry = WeighedEntry(
            id = 3, loggedOn = day, foodId = 7, grams = 90.0, calories = 200.0, protein = 4.0,
        )

        assertEquals("Unknown food", entry.toResponse(foodName = null).name)
    }

    @Test
    fun `the Foods an Entry names but the catalog did not resolve are the ones reported`() {
        val resolved = WeighedEntry(
            id = 5, loggedOn = day, foodId = 5, grams = 120.0, calories = 118.0, protein = 1.3,
        )
        val unresolved = WeighedEntry(
            id = 6, loggedOn = day, foodId = 9, grams = 90.0, calories = 200.0, protein = 4.0,
        )
        val estimate = EstimatedEntry(
            id = 7, loggedOn = day, label = "Cafe lunch", calories = 600.0, protein = null,
        )

        val reported = listOf(resolved, unresolved, estimate, unresolved)
            .unresolvedFoodIds(mapOf(5L to "Banana"))

        // The resolved Food is not reported, the estimate names no Food to resolve,
        // and a Food two Entries share is reported once.
        assertEquals(listOf(9L), reported)
    }
}
