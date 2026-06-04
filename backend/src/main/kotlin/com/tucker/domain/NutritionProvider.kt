package com.tucker.domain

/**
 * What a [NutritionProvider] can do. The barcode-scan chain consults only
 * [BARCODE_LOOKUP]-capable Providers; a [TEXT_SEARCH]-only source (e.g. USDA's
 * generic foods, which have no barcode) is a legitimate Provider that simply
 * doesn't join a scan. See ADR 0006.
 */
enum class ProviderCapability { BARCODE_LOOKUP, TEXT_SEARCH }

/**
 * A backend **port** for an external source of nutrition data (ADR 0006). One
 * implementation per source; the Provider set and order are the operator's
 * choice (deployment config), never the user's, and the frontend never talks to
 * a Provider directly.
 *
 * Implementations normalise whatever the source returns to Tucker's per-100g
 * macro model and return a [FoodCandidate]; calories are re-derived by Atwater
 * downstream, so a Provider never supplies them.
 */
interface NutritionProvider {
    /** The capabilities this Provider declares; see [ProviderCapability]. */
    val capabilities: Set<ProviderCapability>

    /**
     * Look up a product by [barcode], returning a normalised [FoodCandidate], or
     * `null` on a miss. Implementations also return `null` (never throw) on a
     * timeout, rate-limit, or network failure, so the chain falls through to the
     * next Provider.
     */
    fun lookupByBarcode(barcode: String): FoodCandidate?
}
