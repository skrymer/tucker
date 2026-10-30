package com.tucker.domain

/**
 * Each macro's share of a Food's own calories. A share is `null` where the macro
 * itself is unknown — absent is never zero (ADR 0006) — and all three are null for
 * a Food with no calories to divide. Fibre has no share here, so for a Food that
 * states some the three sum to less than 1.
 */
data class MacroEnergyShares(
    val protein: Double?,
    val carbs: Double?,
    val fat: Double?,
)

/** Refuses a negative figure among ones a source may leave unstated, naming it. */
internal fun requireNonNegativeWhereStated(vararg figures: Pair<String, Double?>) {
    for ((name, value) in figures) require(value == null || value >= 0) { "$name must be >= 0" }
}

/**
 * Nutrition values per 100 g of a Food. A value object: immutable, compared by
 * value, and able to scale itself to an actual weight.
 *
 * Calories and protein are always present; carbs, fat, fibre and alcohol are stored
 * when a source provides them but are not targeted (see CONTEXT.md). A null fibre or
 * alcohol is *not stated*, which is not zero (ADR 0040).
 */
data class Nutrition(
    val caloriesPer100g: Double,
    val proteinPer100g: Double,
    val carbsPer100g: Double?,
    val fatPer100g: Double?,
    val fibrePer100g: Double? = null,
    val alcoholPer100g: Double? = null,
) {
    init {
        require(caloriesPer100g >= 0) { "caloriesPer100g must be >= 0, was $caloriesPer100g" }
        require(proteinPer100g >= 0) { "proteinPer100g must be >= 0, was $proteinPer100g" }
        requireNonNegativeWhereStated(
            "carbsPer100g" to carbsPer100g,
            "fatPer100g" to fatPer100g,
            "fibrePer100g" to fibrePer100g,
            "alcoholPer100g" to alcoholPer100g,
        )
    }

    /**
     * Whether this food has any calories to divide. Calories are derived from the
     * macros, so none means no macros either — a diet drink or black coffee. Every figure
     * that divides by them is then genuinely undefined rather than zero.
     */
    private val hasCalories: Boolean get() = caloriesPer100g > 0

    /** Calories in [grams] of this food. */
    fun caloriesFor(grams: Double): Double = caloriesPer100g * grams / GRAMS_PER_100G

    /** Protein (grams) in [grams] of this food. */
    fun proteinFor(grams: Double): Double = proteinPer100g * grams / GRAMS_PER_100G

    /**
     * The grams of this food that [kcal] calories buy — the inverse of
     * [caloriesFor]. Null for a food with no calories, which no amount of
     * exhausts a budget.
     */
    fun gramsFor(kcal: Double): Double? =
        if (hasCalories) kcal / caloriesPer100g * GRAMS_PER_100G else null

    /**
     * The protein this food carries per 100 kcal — the figure a **Pace** is the
     * line for (ADR 0022). Null for a food with no calories: it is a ratio to
     * nothing, not zero.
     */
    fun proteinPer100Kcal(): Double? =
        if (hasCalories) proteinPer100g / caloriesPer100g * Pace.KCAL_PER_100_KCAL else null

    /**
     * How this food's own calories divide between its macros, by the same
     * factors that derived them. Describes composition only — Tucker sets no
     * target for carbs or fat and passes no judgement on either (CONTEXT.md).
     */
    fun macroEnergyShares(): MacroEnergyShares {
        if (!hasCalories) return MacroEnergyShares(null, null, null)
        return MacroEnergyShares(
            protein = KCAL_PER_GRAM_PROTEIN * proteinPer100g / caloriesPer100g,
            carbs = carbsPer100g?.let { KCAL_PER_GRAM_CARBS * it / caloriesPer100g },
            fat = fatPer100g?.let { KCAL_PER_GRAM_FAT * it / caloriesPer100g },
        )
    }

    companion object {
        /** The weight, in grams, that nutrition figures are expressed per. */
        const val GRAMS_PER_100G = 100.0

        /** kcal per gram of each macro: FSANZ's kJ factors rounded to whole kcal, which are the rule (ADR 0040). */
        private const val KCAL_PER_GRAM_PROTEIN = 4.0
        private const val KCAL_PER_GRAM_CARBS = 4.0
        private const val KCAL_PER_GRAM_FAT = 9.0
        private const val KCAL_PER_GRAM_FIBRE = 2.0
        private const val KCAL_PER_GRAM_ALCOHOL = 7.0

        /**
         * Build a [Nutrition] from its macros, computing calories per 100g via
         * `4 × protein + 4 × carbs + 9 × fat + 2 × fibre + 7 × alcohol`, an unstated
         * fibre or alcohol contributing none. See CONTEXT.md — Food calories are derived from
         * macros, never user-entered.
         */
        internal fun fromMacros(macros: Macros): Nutrition = with(macros) {
            Nutrition(
                caloriesPer100g = KCAL_PER_GRAM_PROTEIN * proteinPer100g +
                    KCAL_PER_GRAM_CARBS * carbsPer100g +
                    KCAL_PER_GRAM_FAT * fatPer100g +
                    KCAL_PER_GRAM_FIBRE * (fibrePer100g ?: 0.0) +
                    KCAL_PER_GRAM_ALCOHOL * (alcoholPer100g ?: 0.0),
                proteinPer100g = proteinPer100g,
                carbsPer100g = carbsPer100g,
                fatPer100g = fatPer100g,
                fibrePer100g = fibrePer100g,
                alcoholPer100g = alcoholPer100g,
            )
        }
    }
}
