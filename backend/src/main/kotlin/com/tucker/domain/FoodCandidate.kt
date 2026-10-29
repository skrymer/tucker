package com.tucker.domain

import kotlin.math.abs

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
    /** Null where the Provider states none, which is not zero (ADR 0040). */
    val fibrePer100g: Double? = null,
    /** Grams per 100 g, never ABV; null where the Provider states none. */
    val alcoholPer100g: Double? = null,
) {
    /**
     * The Provider's carbs minus fibre when the fibre is **folded in** — that reading
     * reproduces the stated energy and the carbs as given do not (CONTEXT.md); null
     * otherwise. The energy compared is the whole derived figure, alcohol included.
     */
    val adjustedCarbsPer100g: Double? by lazy { carbsWithoutFoldedFibre() }

    /** The carbs the User is offered: [adjustedCarbsPer100g] where fibre was folded in, else the Provider's. */
    val offeredCarbsPer100g: Double?
        get() = adjustedCarbsPer100g ?: carbsPer100g

    private fun carbsWithoutFoldedFibre(): Double? {
        val carbs = carbsPer100g ?: return null
        val fibre = fibrePer100g ?: return null
        if (derivesStatedEnergy(carbs)) return null
        return (carbs - fibre).takeIf { it >= 0 && derivesStatedEnergy(it) }
    }

    private fun derivesStatedEnergy(carbs: Double): Boolean {
        val stated = statedEnergyKcalPer100g ?: return false
        val protein = proteinPer100g ?: return false
        val fat = fatPer100g ?: return false
        val derived = Macros(protein, carbs, fat, fibrePer100g, alcoholPer100g).nutrition().caloriesPer100g
        return abs(derived - stated) <= FIBRE_FOLDED_TOLERANCE * stated
    }

    /**
     * The Atwater nutrition this candidate implies, or `null` when a macro is
     * absent. An absent macro is never defaulted to zero, so an incomplete
     * candidate has no calories to derive — the user fills the gaps on the
     * Add-Food form, and a surface with no form (a **Check**) cannot proceed.
     */
    fun atwaterNutrition(): Nutrition? {
        val protein = proteinPer100g ?: return null
        val carbs = carbsPer100g ?: return null
        val fat = fatPer100g ?: return null
        return Macros(proteinPer100g = protein, carbsPer100g = carbs, fatPer100g = fat).nutrition()
    }

    init {
        require(name.isNotBlank()) { "Food Candidate name must not be blank" }
        requireNonNegativeWhereStated(
            "proteinPer100g" to proteinPer100g,
            "carbsPer100g" to carbsPer100g,
            "fatPer100g" to fatPer100g,
            "fibrePer100g" to fibrePer100g,
            "alcoholPer100g" to alcoholPer100g,
        )
    }

    companion object {
        /** How far from the stated energy, as a share of it, a derived energy still reproduces it. */
        const val FIBRE_FOLDED_TOLERANCE = 0.05
    }
}
