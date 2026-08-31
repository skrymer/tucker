package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * What a [Micronutrients] refuses to be. AFCD populates all nineteen on all 1,588
 * of its foods, so a hole is a parse that went wrong rather than a food that
 * lacks the nutrient — a food that lacks it reports zero (ADR 0027).
 */
class MicronutrientsTest {

    private val everything = Micronutrient.entries.associateWith { 1.0 }

    @Test
    fun `an amount is scaled from the per-100 g figure by the grams eaten`() {
        val profile = Micronutrients(everything + (Micronutrient.IRON to 2.5))

        assertEquals(
            17.5,
            profile.amountFor(Micronutrient.IRON, grams = 700.0),
            "700 g of a food reporting 2.5 mg per 100 g supplies 17.5 mg — the " +
                "micronutrient counterpart of Nutrition.proteinFor, on the type that " +
                "owns the per-100 g unit rather than in a caller doing its own division",
        )
    }

    @Test
    fun `a profile missing a nutrient is refused, and says which`() {
        val error = assertFailsWith<IllegalArgumentException> {
            Micronutrients(everything - Micronutrient.IODINE)
        }

        // Named, because the whole point of refusing is that a silent zero would be
        // indistinguishable from a food that genuinely has none.
        assertTrue(
            error.message!!.contains("IODINE"),
            "the refusal has to name the nutrient that went missing, was: ${error.message}",
        )
    }

    @Test
    fun `a negative amount is refused`() {
        // No food supplies less than none of something, so a negative is a parse or a
        // unit conversion that went wrong, and it would sum into a lower bound that
        // is no longer a lower bound.
        assertFailsWith<IllegalArgumentException> {
            Micronutrients(everything + (Micronutrient.IRON to -0.1))
        }
    }
}
