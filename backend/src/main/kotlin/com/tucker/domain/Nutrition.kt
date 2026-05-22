package com.tucker.domain

/**
 * Nutrition values per 100 g of a Food. A value object: immutable, compared by
 * value, and able to scale itself to an actual weight.
 *
 * Calories and protein are always present; carbs and fat are stored when a
 * source provides them but are not targeted (see CONTEXT.md).
 */
data class Nutrition(
    val caloriesPer100g: Double,
    val proteinPer100g: Double,
    val carbsPer100g: Double?,
    val fatPer100g: Double?,
) {
    init {
        require(caloriesPer100g >= 0) { "caloriesPer100g must be >= 0, was $caloriesPer100g" }
        require(proteinPer100g >= 0) { "proteinPer100g must be >= 0, was $proteinPer100g" }
        require(carbsPer100g == null || carbsPer100g >= 0) { "carbsPer100g must be >= 0" }
        require(fatPer100g == null || fatPer100g >= 0) { "fatPer100g must be >= 0" }
    }

    /** Calories in [grams] of this food. */
    fun caloriesFor(grams: Double): Double = caloriesPer100g * grams / GRAMS_PER_100G

    /** Protein (grams) in [grams] of this food. */
    fun proteinFor(grams: Double): Double = proteinPer100g * grams / GRAMS_PER_100G

    companion object {
        /** The weight, in grams, that nutrition figures are expressed per. */
        const val GRAMS_PER_100G = 100.0
    }
}
