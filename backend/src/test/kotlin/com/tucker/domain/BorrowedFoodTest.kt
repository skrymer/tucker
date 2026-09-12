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
    fun `a Recipe supplies no figure of its own — it divides into what made it`() {
        val mince = BorrowedFood(food(referenceFoodId = null), reference = null)
        val borrowed = BorrowedFood(
            bolognese,
            reference = null,
            ingredients = listOf(BorrowedIngredient(mince, grams = 900.0)),
        )

        val parts = borrowed.divide(grams = 300.0, calories = 400.0)

        assertEquals(
            listOf("Chicken breast"),
            parts.map { it.borrowed.food.name },
            "a Recipe rolls its micronutrients up from whichever ingredients are " +
                "matched (CONTEXT.md), so it never stands among its own contributions " +
                "— asserting `contributes` is false would pass for any Food at all",
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

    @Test
    fun `a Recipe joined to no composition is refused`() {
        val refused = assertFailsWith<MisjoinedBorrowException> {
            BorrowedFood(bolognese, reference = null)
        }

        assertEquals(
            "'Bolognese' is a Recipe but was joined to no composition",
            refused.message,
            "a Recipe with no ingredients to roll up reads as a Food borrowing nothing " +
                "— a lower figure, and a queue offering the dish itself as a tap that " +
                "cannot be taken (ADR 0027)",
        )
    }

    @Test
    fun `a plain Food joined to a composition is refused`() {
        val chicken = food(referenceFoodId = null)

        val refused = assertFailsWith<MisjoinedBorrowException> {
            BorrowedFood(
                chicken,
                reference = null,
                ingredients = listOf(BorrowedIngredient(BorrowedFood(chicken, null), grams = 100.0)),
            )
        }

        assertEquals(
            "'Chicken breast' is not a Recipe but was joined to a composition",
            refused.message,
            "only a Recipe rolls up, so ingredients on a plain Food would divide it into " +
                "food nobody weighed into it, and drop the Food itself out of the queue",
        )
    }

    @Test
    fun `a batch that cost nothing divides its grams and shares out no calories`() {
        val leaves = plain("Spinach", calories = 0.0)
        val water = plain("Water", calories = 0.0)
        val broth = BorrowedFood(
            Food(
                id = 9,
                name = "Green broth",
                kind = FoodKind.RECIPE,
                barcode = null,
                nutrition = Nutrition(0.0, 0.0, null, null),
                cookedWeightG = 1000.0,
            ),
            reference = null,
            ingredients = listOf(
                BorrowedIngredient(BorrowedFood(leaves, null), grams = 600.0),
                BorrowedIngredient(BorrowedFood(water, null), grams = 400.0),
            ),
        )

        val parts = broth.divide(grams = 500.0, calories = 0.0)

        assertEquals(
            listOf(300.0 to 0.0, 200.0 to 0.0),
            parts.map { it.grams to it.calories },
            "half the batch was eaten, so the grams still divide — but a batch of " +
                "nothing but leaves and water has no calories to take a share of, and " +
                "0/0 would put a NaN on the wire for every figure downstream",
        )
    }

    /** A plain Food stated by its calories, where the macros behind them don't matter. */
    private fun plain(name: String, calories: Double) = Food.plain(
        id = name.hashCode().toLong(),
        name = name,
        barcode = null,
        nutrition = Nutrition(calories, proteinPer100g = 0.0, carbsPer100g = null, fatPer100g = null),
    )

    private val bolognese = Food(
        id = 3,
        name = "Bolognese",
        kind = FoodKind.RECIPE,
        barcode = null,
        nutrition = Nutrition.fromMacros(proteinPer100g = 8.0, carbsPer100g = 12.0, fatPer100g = 5.0),
        cookedWeightG = 900.0,
    )

    private fun food(referenceFoodId: Long?) = Food.plain(
        id = 1,
        name = "Chicken breast",
        barcode = null,
        nutrition = Nutrition.fromMacros(proteinPer100g = 31.0, carbsPer100g = 0.0, fatPer100g = 3.6),
    ).copy(referenceFoodId = referenceFoodId)
}
