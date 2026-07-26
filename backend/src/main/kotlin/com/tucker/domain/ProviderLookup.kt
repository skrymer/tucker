package com.tucker.domain

/**
 * What one [NutritionProvider] made of a barcode (ADR 0006, issue #164).
 *
 * A Provider answering *no match* and a Provider unable to answer at all are
 * different results and must never be collapsed: the first is a verdict, the
 * second is the absence of one. They earn opposite advice — move on, versus try
 * again — and a silent [Inconclusive] leads the user to hand-enter a product a
 * Provider knows, which then owns the barcode in their catalog forever.
 */
sealed interface ProviderLookup {
    /** The Provider knew the product. */
    data class Found(val candidate: FoodCandidate) : ProviderLookup

    /** The Provider answered, and has never heard of this barcode. */
    data object Missing : ProviderLookup

    /**
     * The Provider could not be asked, or could not be understood — unreachable,
     * timed out, rate-limiting, or replying with something unusable. Whether the
     * product exists is simply unknown.
     */
    data object Inconclusive : ProviderLookup
}
