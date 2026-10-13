package com.tucker.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * A Food's own behaviour. The borrow it makes of a **Reference Food**'s
 * micronutrients is a transition the Food performs, not a field a caller sets:
 * a Recipe rolls its micronutrients up from its ingredients and so can never be
 * matched, and that rule is only reliably enforced where the transition lives.
 */
class FoodTest {

    @Test
    fun `a Food matched to a Reference Food borrows from it`() {
        assertEquals<Long?>(
            CHEDDAR.id,
            CHEESE.matchedTo(CHEDDAR).referenceFoodId,
            "the borrow is a pointer rather than a copy, so what the Food gains is the " +
                "Reference Food's identity and nothing else",
        )
    }

    @Test
    fun `a Food that takes its borrow back contributes nothing again`() {
        assertNull(
            CHEESE.matchedTo(CHEDDAR).unmatched().referenceFoodId,
            "a match is reversible for the reason it is confirmed in the first place: " +
                "a wrong one is worse than none",
        )
    }

    @Test
    fun `a Food retagged carries exactly the Tags it was given, each once`() {
        assertEquals(
            setOf(SNACK, POST_WORKOUT),
            CHEESE.retagged(listOf(BREAKFAST)).retagged(listOf(SNACK, POST_WORKOUT, SNACK)).tagIds,
        )
    }

    @Test
    fun `a corrected Food derives its calories from the corrected macros`() {
        val corrected = CHEESE.corrected(
            name = "Tasty cheese",
            macros = Macros(proteinPer100g = 13.0, carbsPer100g = 2.0, fatPer100g = 10.0),
            tagIds = emptyList(),
        )

        assertEquals(
            Nutrition(caloriesPer100g = 150.0, proteinPer100g = 13.0, carbsPer100g = 2.0, fatPer100g = 10.0),
            corrected.nutrition,
            "4 × 13 + 4 × 2 + 9 × 10: calories are never entered, so a correction re-derives them",
        )
    }

    @Test
    fun `a corrected Food carries the corrected name and exactly the Tags it was given`() {
        val corrected = CHEESE.retagged(listOf(BREAKFAST)).corrected(
            name = "Tasty cheddar",
            macros = CHEESE_MACROS,
            tagIds = listOf(SNACK, POST_WORKOUT, SNACK),
        )

        assertEquals("Tasty cheddar", corrected.name)
        assertEquals(setOf(SNACK, POST_WORKOUT), corrected.tagIds)
    }

    @Test
    fun `a correction keeps the Food's identity, barcode, kind and Reference Food match`() {
        val scanned = Food.plain(id = 9L, name = "Cheddar", barcode = "9300633603208", nutrition = CHEESE.nutrition)
            .matchedTo(CHEDDAR)

        val corrected = scanned.corrected(name = "Cheddar block", macros = CHEESE_MACROS, tagIds = emptyList())

        assertEquals(9L, corrected.id)
        assertEquals("9300633603208", corrected.barcode, "a barcode comes from the scanner, never a correction")
        assertEquals(FoodKind.Plain, corrected.kind)
        assertEquals<Long?>(
            CHEDDAR.id,
            corrected.referenceFoodId,
            "a match is changed deliberately, never as a side effect",
        )
    }

    @Test
    fun `a correction to a blank name is refused`() {
        kotlin.test.assertFailsWith<IllegalArgumentException> {
            CHEESE.corrected(name = "  ", macros = CHEESE_MACROS, tagIds = emptyList())
        }
    }

    @Test
    fun `a correction to a negative macro is refused`() {
        kotlin.test.assertFailsWith<IllegalArgumentException> {
            CHEESE.corrected(
                name = "Tasty cheese",
                macros = Macros(proteinPer100g = 25.0, carbsPer100g = -1.0, fatPer100g = 33.0),
                tagIds = emptyList(),
            )
        }
    }

    @Test
    fun `a Recipe cannot be corrected as a Food, because its macros come from its composition`() {
        val recipe = Food(10L, "Chilli", FoodKind.Recipe(cookedWeightG = 1200.0), null, CHEESE.nutrition)

        kotlin.test.assertFailsWith<IllegalArgumentException> {
            recipe.corrected(name = "Chilli con carne", macros = CHEESE_MACROS, tagIds = emptyList())
        }
    }
}

private const val BREAKFAST = 3L
private const val SNACK = 4L
private const val POST_WORKOUT = 5L

private val CHEESE_MACROS = Macros(proteinPer100g = 25.0, carbsPer100g = 0.0, fatPer100g = 33.0)

private val CHEESE = Food.plain(
    id = 1L,
    name = "Tasty cheese",
    barcode = null,
    nutrition = Nutrition.fromMacros(proteinPer100g = 25.0, carbsPer100g = 0.0, fatPer100g = 33.0),
)

private val CHEDDAR = ReferenceFood(
    id = 7L,
    publicFoodKey = "F009123",
    name = "Cheese, cheddar, natural, regular fat",
    micronutrients = Micronutrients(Micronutrient.entries.associateWith { 0.0 }),
)
