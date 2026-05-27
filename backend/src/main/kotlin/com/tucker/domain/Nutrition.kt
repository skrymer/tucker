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

        /** kcal per gram of each macronutrient, per the standard Atwater factors. */
        private const val KCAL_PER_GRAM_PROTEIN = 4.0
        private const val KCAL_PER_GRAM_CARBS = 4.0
        private const val KCAL_PER_GRAM_FAT = 9.0

        /**
         * Build a [Nutrition] from its macros, computing calories per 100g via
         * `4 × protein + 4 × carbs + 9 × fat`. See CONTEXT.md — Food calories
         * are derived from macros, never user-entered.
         */
        fun fromMacros(
            proteinPer100g: Double,
            carbsPer100g: Double,
            fatPer100g: Double,
        ): Nutrition = Nutrition(
            caloriesPer100g = KCAL_PER_GRAM_PROTEIN * proteinPer100g +
                KCAL_PER_GRAM_CARBS * carbsPer100g +
                KCAL_PER_GRAM_FAT * fatPer100g,
            proteinPer100g = proteinPer100g,
            carbsPer100g = carbsPer100g,
            fatPer100g = fatPer100g,
        )
    }
}
