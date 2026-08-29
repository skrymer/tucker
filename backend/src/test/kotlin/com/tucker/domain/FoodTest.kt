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
}

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
