package com.tucker.persistence

import com.tucker.domain.ReferenceFoodQuery
import com.tucker.domain.ReferenceFoodSearch
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The queries a design spike measured against the real AFCD corpus, pinned
 * (issue #278). Naive tokenising answered 5 of 15 of them, and each one below broke
 * in a different way — a plural that matched nothing, a qualifier that decided the
 * match, a shopper's word the corpus does not contain.
 *
 * Against the seeded database rather than a fixture, because all three fixes live
 * in SQLite: the stemmer is FTS5's, the ten-to-one head weighting is in the `bm25`
 * call, and the corpus is what makes a ranking right or wrong in the first place.
 */
@SpringBootTest
class ReferenceFoodRankingTest {

    @Autowired lateinit var referenceFoods: ReferenceFoodRepository

    @Test
    fun `a plural finds the food AFCD names in the singular`() {
        assertTrue(
            search("Almonds").isNotEmpty(),
            "AFCD says `Nut, almond`, and without porter stemming a plural matches nothing",
        )
    }

    @Test
    fun `a qualifier of some other food does not decide the match`() {
        val hits = search("Free-range eggs")

        assertTrue(
            hits.none { it == "Bread, gluten free" },
            "the spike's dangerous failure: *free* matched a bread's qualifier, and a " +
                "confidently wrong top hit is worse than a miss. Was $hits",
        )
        assertTrue(
            hits.first().startsWith("Egg,"),
            "what a shopper meant is still what they get: was ${hits.first()}",
        )
    }

    @Test
    fun `a shopper's word for a cheese finds that cheese`() {
        assertTrue(
            search("Tasty cheese").first().startsWith("Cheese, cheddar"),
            "nothing in an Australian supermarket is labelled `cheddar`, and the corpus " +
                "knows no `tasty`",
        )
    }

    @Test
    fun `a cut names the food it is a cut of`() {
        assertEquals(
            "Chicken, breast, lean flesh, raw",
            search("Chicken breast").first(),
            "`breast` is a discriminator rather than retail noise -- an early stop-list " +
                "dropped it and broke exactly this",
        )
    }

    @Test
    fun `a package read aloud still finds the food it describes`() {
        assertEquals(
            "Chicken, breast, lean flesh, raw",
            search("Coles free range chicken breast fillet").first(),
            "no AFCD name holds `coles`, so requiring every word answers nothing -- and a " +
                "shopper reading a package aloud is the ordinary way this is used",
        )
    }

    @Test
    fun `a food the corpus does not hold answers nothing rather than something`() {
        assertEquals(
            emptyList(),
            search("Sourdough"),
            "AFCD is generic staples and not a retail catalogue, so its coverage ceiling " +
                "is real -- and an empty answer is the honest one (ADR 0027)",
        )
    }

    @Test
    fun `no match is offered when the best hit is named for more than was asked for`() {
        val search = ReferenceFoodSearch.of(candidates("Almonds"))

        assertTrue(
            search.candidates.first().food.name.startsWith("Almond beverage"),
            "head-noun boosting backfires on a compound head starting with the query " +
                "word, which is a residual ADR 0027 accepts rather than solves",
        )
        assertNull(
            search.suggested,
            "so the tap is withheld: an almond beverage is not what anybody typing " +
                "`Almonds` meant, and Tucker lists it rather than offering it",
        )
    }

    @Test
    fun `a match is offered when the words name the whole food`() {
        assertEquals(
            "Cheese, cheddar, natural, regular fat",
            ReferenceFoodSearch.of(candidates("Tasty cheese")).suggested?.food?.name,
            "`cheddar cheese` accounts for every word of the head `Cheese`",
        )
    }

    @Test
    fun `a candidate carries the figures its row holds, undegraded by the search`() {
        val found = candidates("Chicken breast")
            .map { it.food }
            .first { it.name == "Chicken, breast, lean flesh, skin & fat, raw" }

        assertEquals(
            referenceFoods.findById(found.id)?.micronutrients,
            found.micronutrients,
            "the search is plain SQL, so jOOQ has no generated metadata to type its " +
                "columns from and takes SQLite's REAL as a Float — which turns a seeded " +
                "0.4 into 0.4000000059604645 on the way to the picker",
        )
    }

    private fun candidates(text: String) =
        referenceFoods.search(ReferenceFoodQuery.of(text, referenceFoods.synonyms()), LIMIT)

    private fun search(text: String): List<String> = candidates(text).map { it.food.name }

    private companion object {
        /** As many as the picker asks for. */
        const val LIMIT = 20
    }
}
