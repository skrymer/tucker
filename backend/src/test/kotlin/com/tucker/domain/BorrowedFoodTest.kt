package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
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
                kind = FoodKind.Recipe(cookedWeightG = 1000.0),
                barcode = null,
                nutrition = Nutrition(0.0, 0.0, null, null),
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

    @Test
    fun `a contribution's stated fibre wins over the fibre it borrows`() {
        val eaten = wrapEaten(fibre = 16.8, borrowsFibre = 3.0)

        assertEquals(
            33.6,
            eaten.amountOf(Micronutrient.FIBRE),
            1e-9,
            "200 g of a wrap labelled 16.8 g per 100 g — the label describes that " +
                "product, the Reference Food only something like it (CONTEXT.md)",
        )
    }

    @Test
    fun `a contribution stating 0 g fibre supplies none, rather than borrowing`() {
        val eaten = wrapEaten(fibre = 0.0, borrowsFibre = 3.0)

        assertEquals(
            0.0,
            eaten.amountOf(Micronutrient.FIBRE),
            "a stated 0 g says the product has none — not stated is not zero, so zero " +
                "is not filled in from the Reference Food (CONTEXT.md, Food)",
        )
    }

    @Test
    fun `a contribution stating no fibre borrows it, scaled by the grams eaten`() {
        val eaten = wrapEaten(fibre = null, borrowsFibre = 3.0)

        assertEquals(
            6.0,
            eaten.amountOf(Micronutrient.FIBRE),
            1e-9,
            "a label silent on fibre is not one saying none, so the borrow fills the gap: " +
                "3 g per 100 g over the 200 g eaten",
        )
    }

    @Test
    fun `an unmatched contribution stating fibre supplies that fibre and nothing else`() {
        val eaten = wrapEaten(fibre = 16.8, borrowsFibre = null)

        assertEquals(
            Micronutrient.entries.associateWith { if (it == Micronutrient.FIBRE) 33.6 else 0.0 },
            Micronutrient.entries.associateWith { eaten.amountOf(it) },
            "what the User typed counts, but a label states fibre alone — every other " +
                "figure needs a Reference Food behind it (CONTEXT.md)",
        )
    }

    @Test
    fun `stating fibre leaves every other nutrient borrowed`() {
        val eaten = wrapEaten(fibre = 16.8, borrowsFibre = 3.0)

        assertEquals(
            2.0,
            eaten.amountOf(Micronutrient.IRON),
            1e-9,
            "the label wins for fibre alone — the iron still comes from the Reference " +
                "Food, 1 mg per 100 g over the 200 g eaten",
        )
    }

    /**
     * 200 g of a wrap stating [fibre] per 100 g, matched to a Reference Food lending
     * [borrowsFibre] g of fibre and 1 mg of iron per 100 g — or unmatched, where
     * [borrowsFibre] is null.
     */
    private fun wrapEaten(fibre: Double?, borrowsFibre: Double?): FoodContribution {
        val wrap = Food.plain(
            id = 7,
            name = "Protein wrap",
            barcode = null,
            nutrition = Macros(19.4, 12.8, 9.3, fibrePer100g = fibre).nutrition(),
        ).copy(referenceFoodId = borrowsFibre?.let { 42 })
        val reference = borrowsFibre?.let {
            referenceFood("Wrap, white", Micronutrient.FIBRE to it, Micronutrient.IRON to 1.0, id = 42)
        }
        return FoodContribution(BorrowedFood(wrap, reference), grams = 200.0, calories = 492.2)
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
        kind = FoodKind.Recipe(cookedWeightG = 900.0),
        barcode = null,
        nutrition = Macros(proteinPer100g = 8.0, carbsPer100g = 12.0, fatPer100g = 5.0).nutrition(),
    )

    private fun food(referenceFoodId: Long?) = Food.plain(
        id = 1,
        name = "Chicken breast",
        barcode = null,
        nutrition = Macros(proteinPer100g = 31.0, carbsPer100g = 0.0, fatPer100g = 3.6).nutrition(),
    ).copy(referenceFoodId = referenceFoodId)
}
