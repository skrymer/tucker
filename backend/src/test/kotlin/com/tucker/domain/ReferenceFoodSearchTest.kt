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
                candidate("Beef, mince, regular, raw", Micronutrient.IRON to 1.8, Micronutrient.SODIUM to 65.0),
                candidate("Beef, mince, regular, fried", Micronutrient.IRON to 2.4, Micronutrient.SODIUM to 66.0),
                candidate("Beef, liver, raw", Micronutrient.IRON to 6.1, Micronutrient.SODIUM to 67.0),
            ),
        )

        assertEquals(
            Micronutrient.IRON,
            search.distinguishing.first(),
            "iron spans more than threefold across these three and sodium barely moves, " +
                "so iron is what tells them apart — and the two are compared as ratios " +
                "because milligrams of one nutrient say nothing about milligrams of another",
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

/** A Reference Food carrying [amounts], and zero of everything else. */
internal fun referenceFood(name: String, vararg amounts: Pair<Micronutrient, Double>) = ReferenceFood(
    id = name.hashCode().toLong(),
    publicFoodKey = "F%06d".format(name.hashCode().mod(1_000_000)),
    name = name,
    micronutrients = Micronutrients(
        Micronutrient.entries.associateWith { 0.0 } + amounts.toMap(),
    ),
)
