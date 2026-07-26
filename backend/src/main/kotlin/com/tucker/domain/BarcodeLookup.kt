package com.tucker.domain

/**
 * The discriminated outcome of a barcode lookup (ADR 0006). A catalog hit yields
 * an [Existing] saved [Food]; a Provider hit yields a [Candidate] the user reviews
 * before confirming.
 *
 * The two empty-handed outcomes are kept apart on purpose (issue #164):
 * [Missing] is an answer — everything that could be asked was, and none of it knew
 * the product — while [Inconclusive] is the absence of one. They earn opposite
 * advice, and presenting the second as the first is what leads a user to
 * hand-enter a product a Provider knows.
 */
sealed interface BarcodeLookup {
    /** The barcode matched a saved [Food] in the user's own catalog. */
    data class Existing(val food: Food) : BarcodeLookup

    /** No catalog match, but a [NutritionProvider] knew the product. */
    data class Candidate(val candidate: FoodCandidate) : BarcodeLookup

    /** Every barcode-capable Provider answered, and none knew the product. */
    data object Missing : BarcodeLookup

    /** No Provider could answer. Whether the product exists is simply unknown. */
    data object Inconclusive : BarcodeLookup
}
