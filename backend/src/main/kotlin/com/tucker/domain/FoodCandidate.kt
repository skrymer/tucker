package com.tucker.domain

/**
 * Normalised, unsaved nutrition the user reviews before confirming it into a [Food].
 *
 * Produced by a barcode lookup that misses the user's catalog but hits a
 * [NutritionProvider]. It carries the per-100g macros the source supplied (some
 * possibly **absent** — kept absent, never defaulted to zero), the Provider's
 * **stated energy** (shown only as a cross-check, never stored), the source for
 * attribution, and the scanned barcode. Calories are deliberately **not** stored:
 * they are re-derived by the Atwater rule when the user confirms the Food, exactly
 * like a hand-entered Food. See CONTEXT.md and ADR 0006.
 */
data class FoodCandidate(
    val name: String,
    val barcode: String,
    val proteinPer100g: Double?,
    val carbsPer100g: Double?,
    val fatPer100g: Double?,
    val statedEnergyKcalPer100g: Double?,
    val source: String,
) {
    init {
        require(name.isNotBlank()) { "Food Candidate name must not be blank" }
        require(proteinPer100g == null || proteinPer100g >= 0) { "proteinPer100g must be >= 0" }
        require(carbsPer100g == null || carbsPer100g >= 0) { "carbsPer100g must be >= 0" }
        require(fatPer100g == null || fatPer100g >= 0) { "fatPer100g must be >= 0" }
    }
}
