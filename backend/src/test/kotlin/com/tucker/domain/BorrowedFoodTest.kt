package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith

/**
 * A **Food** joined to what it borrows. The join is checked rather than assumed,
 * because both ways of getting it wrong are silent: a matched Food joined to
 * nothing reads as unmatched, which is a lower figure and a longer queue with
 * nothing saying why (ADR 0027).
 *
 * A mis-join is Tucker assembling its own data wrongly, so it is a server fault
 * and gets a type of its own rather than the `require` that would report it to a
 * User as a 400 they could do something about.
 */
class BorrowedFoodTest {

    @Test
    fun `a Recipe contributes nothing, whatever it is joined to`() {
        val bolognese = Food(
            id = 3,
            name = "Bolognese",
            kind = FoodKind.RECIPE,
            barcode = null,
            nutrition = Nutrition.fromMacros(proteinPer100g = 8.0, carbsPer100g = 12.0, fatPer100g = 5.0),
            cookedWeightG = 900.0,
        )

        assertFalse(
            BorrowedFood(bolognese, reference = null).contributes,
            "a Recipe rolls its micronutrients up from whichever ingredients are " +
                "matched (CONTEXT.md), so it supplies no figure and covers nothing — " +
                "one rule, so a window's numerator and denominator describe the same " +
                "set of food",
        )
    }

    @Test
    fun `a Food matched to a Reference Food it was not joined to is refused`() {
        val chicken = food(referenceFoodId = 42)

        val refused = assertFailsWith<MisjoinedBorrowException> {
            BorrowedFood(chicken, reference = null)
        }

        assertEquals(
            "'Chicken breast' is matched but was joined to nothing",
            refused.message,
            "silently reading it as unmatched would lower every figure it could have " +
                "supplied and put it back in the queue as a tap already taken",
        )
    }

    @Test
    fun `a Food joined to a Reference Food other than the one it names is refused`() {
        val chicken = food(referenceFoodId = 42)

        val refused = assertFailsWith<MisjoinedBorrowException> {
            BorrowedFood(chicken, reference = referenceFood("Chicken, breast, lean flesh, raw", id = 43))
        }

        assertEquals(
            "'Chicken breast' borrows 42 but was joined to 43",
            refused.message,
            "a match is a claim a human made about one generic food, so a join that " +
                "quietly substitutes another reports a week of figures for something " +
                "nobody chose (ADR 0027)",
        )
    }

    private fun food(referenceFoodId: Long?) = Food.plain(
        id = 1,
        name = "Chicken breast",
        barcode = null,
        nutrition = Nutrition.fromMacros(proteinPer100g = 31.0, carbsPer100g = 0.0, fatPer100g = 3.6),
    ).copy(referenceFoodId = referenceFoodId)
}
