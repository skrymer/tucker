package com.tucker.domain

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The words a User types, turned into the words FSANZ writes (ADR 0027).
 *
 * The failures this fixes are systematic rather than random: no amount of ranking
 * recovers a word the corpus does not contain, and `Tasty cheese` returning nothing
 * is most of a first impression.
 */
class ReferenceFoodQueryTest {

    @Test
    fun `a shopper's word becomes the word the database writes`() {
        assertEquals(
            listOf("cheddar", "cheese"),
            ReferenceFoodQuery.of("Tasty cheese", SYNONYMS).terms,
            "AFCD writes `Cheese, cheddar`, and nothing in Australia is labelled that way",
        )
    }

    @Test
    fun `a phrase's first word alone is left as it was typed`() {
        assertEquals(
            listOf("full"),
            ReferenceFoodQuery.of("full", SYNONYMS).terms,
            "`full cream` runs past the end of what was typed, so it does not match — " +
                "the phrase is two words and there is only one to compare it against",
        )
    }

    @Test
    fun `a phrase is rewritten as a phrase`() {
        assertEquals(
            listOf("regular", "fat", "milk"),
            ReferenceFoodQuery.of("full cream milk", SYNONYMS).terms,
            "AFCD writes `Milk, cow, fluid, regular fat`, and neither `full` nor `cream` " +
                "alone rewrites to anything",
        )
    }

    @Test
    fun `a word that describes farming rather than food is dropped`() {
        assertEquals(
            listOf("egg"),
            ReferenceFoodQuery.of("Free-range egg", SYNONYMS).terms,
            "left in, `free` matched `Bread, gluten free` -- a confidently wrong top hit, " +
                "which is worse than a miss (ADR 0027)",
        )
    }
}

/** The rewrites V17 seeds, as the repository hands them over. */
private val SYNONYMS = mapOf(
    "tasty" to "cheddar",
    "full cream" to "regular fat",
    "free range" to "",
    "lite" to "reduced fat",
)
