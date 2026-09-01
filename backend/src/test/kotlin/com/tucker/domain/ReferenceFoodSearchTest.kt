package com.tucker.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * A search of the Reference Foods (ADR 0027). What it decides is which candidate —
 * if any — Tucker offers to accept, and which figures a User is shown to tell the
 * near-identical candidates apart.
 */
class ReferenceFoodSearchTest {

    @Test
    fun `the figures offered are the ones the candidates most disagree about`() {
        val search = ReferenceFoodSearch.of(
            listOf(
                candidate("Beef, mince, regular, raw", Micronutrient.IRON to 1.8, Micronutrient.CALCIUM to 100.0),
                candidate("Beef, mince, regular, fried", Micronutrient.IRON to 2.4, Micronutrient.CALCIUM to 102.0),
                candidate("Beef, liver, raw", Micronutrient.IRON to 6.1, Micronutrient.CALCIUM to 105.0),
            ),
        )

        assertEquals(
            Micronutrient.IRON,
            search.distinguishing.first(),
            "iron and calcium each give all three a different figure, so neither separates " +
                "more of the set than the other — and iron wins the tie because it spans " +
                "more than threefold while calcium moves by a twentieth. That is a ratio " +
                "and not an amount on purpose: calcium covers the wider range in milligrams, " +
                "and milligrams of one nutrient say nothing about milligrams of another",
        )
    }

    @Test
    fun `a nutrient nearly every candidate reports as zero is not what tells them apart`() {
        val search = ReferenceFoodSearch.of(
            listOf(
                candidate(
                    "Chicken, breast, lean flesh, raw",
                    Micronutrient.FIBRE to 0.0,
                    Micronutrient.IRON to 0.4,
                    Micronutrient.ZINC to 0.8,
                    Micronutrient.NIACIN to 8.5,
                    Micronutrient.SODIUM to 60.0,
                ),
                candidate(
                    "Chicken, breast, lean flesh, baked",
                    Micronutrient.FIBRE to 0.0,
                    Micronutrient.IRON to 0.7,
                    Micronutrient.ZINC to 1.1,
                    Micronutrient.NIACIN to 9.2,
                    Micronutrient.SODIUM to 60.0,
                ),
                candidate(
                    "Chicken, thigh, lean flesh, baked",
                    Micronutrient.FIBRE to 0.0,
                    Micronutrient.IRON to 1.2,
                    Micronutrient.ZINC to 1.9,
                    Micronutrient.NIACIN to 11.0,
                    Micronutrient.SODIUM to 60.0,
                ),
                candidate(
                    "Chicken, breast, crumbed, fried",
                    Micronutrient.FIBRE to 0.5,
                    Micronutrient.IRON to 1.6,
                    Micronutrient.ZINC to 2.6,
                    Micronutrient.NIACIN to 12.4,
                    Micronutrient.SODIUM to 60.0,
                ),
            ),
        )

        assertEquals(
            listOf(Micronutrient.IRON, Micronutrient.ZINC, Micronutrient.NIACIN),
            search.distinguishing,
            "fibre is 0 g on every cut but the crumbed one, so it separates that one " +
                "candidate from the rest and tells the other three nothing apart — while " +
                "iron, zinc and niacin each give all four a different figure, which is what " +
                "a column has to do to be worth reading down",
        )
    }

    @Test
    fun `the best candidate is offered when the words name the whole food`() {
        val search = ReferenceFoodSearch.of(
            listOf(
                candidate("Cheese, cheddar, natural, regular fat", namesTheWholeFood = true),
                candidate("Cheese, cheddar, processed", namesTheWholeFood = true),
            ),
        )

        assertEquals(
            "Cheese, cheddar, natural, regular fat",
            search.suggested?.food?.name,
            "`Tasty cheese` rewrites to `cheddar cheese`, which names the whole of the " +
                "head `Cheese` — so Tucker offers the top hit for a tap",
        )
    }

    @Test
    fun `nothing is offered when the best candidate is named for more than was asked for`() {
        val search = ReferenceFoodSearch.of(
            listOf(
                candidate("Almond beverage, added sugar, unfortified", namesTheWholeFood = false),
                candidate("Nut, almond, with skin, raw, unsalted", namesTheWholeFood = false),
            ),
        )

        assertNull(
            search.suggested,
            "`Almonds` ranks an almond *beverage* first, because head-noun boosting " +
                "backfires on a compound head starting with the query word — and a " +
                "confidently wrong tap is this feature's characteristic failure, so " +
                "Tucker lists the candidates and offers none",
        )
    }
}

private fun candidate(
    name: String,
    vararg amounts: Pair<Micronutrient, Double>,
    namesTheWholeFood: Boolean = true,
) = ReferenceFoodCandidate(referenceFood(name, *amounts), namesTheWholeFood)

/**
 * A Reference Food carrying [amounts], and zero of everything else. [id] defaults
 * to one derived from the name, and is given explicitly by the tests that join a
 * Food to it — a [BorrowedFood] refuses a join whose two halves name each other.
 */
internal fun referenceFood(
    name: String,
    vararg amounts: Pair<Micronutrient, Double>,
    id: Long = name.hashCode().toLong(),
) = ReferenceFood(
    id = id,
    publicFoodKey = "F%06d".format(name.hashCode().mod(1_000_000)),
    name = name,
    micronutrients = Micronutrients(
        Micronutrient.entries.associateWith { 0.0 } + amounts.toMap(),
    ),
)
