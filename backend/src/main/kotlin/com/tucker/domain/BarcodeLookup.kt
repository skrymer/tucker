package com.tucker.domain

/**
 * The discriminated outcome of a barcode lookup (ADR 0006). A catalog hit yields
 * an [Existing] saved [Food]; a Provider hit yields a [Candidate] the user reviews
 * before confirming. A total miss is modelled as `null` by the resolver.
 */
sealed interface BarcodeLookup {
    /** The barcode matched a saved [Food] in the user's own catalog. */
    data class Existing(val food: Food) : BarcodeLookup

    /** No catalog match, but a [NutritionProvider] knew the product. */
    data class Candidate(val candidate: FoodCandidate) : BarcodeLookup
}
