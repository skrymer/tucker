package com.tucker.domain

/** Whether a Food is a plain food or a composite [Recipe]. */
enum class FoodKind { FOOD, RECIPE }

/**
 * A reusable definition of something edible — a name plus [Nutrition] per 100 g.
 * A Recipe is a Food with [kind] = RECIPE; see [Recipe] for how one is built.
 */
data class Food(
    val id: Long?,
    val name: String,
    val kind: FoodKind,
    val barcode: String?,
    val nutrition: Nutrition,
    val cookedWeightG: Double?,
) {
    init {
        require(name.isNotBlank()) { "Food name must not be blank" }
        require(cookedWeightG == null || cookedWeightG > 0) {
            "cookedWeightG must be > 0 when set, was $cookedWeightG"
        }
        require(kind == FoodKind.RECIPE || cookedWeightG == null) {
            "cookedWeightG only applies to a RECIPE"
        }
    }

    /** Calories in [grams] of this Food. */
    fun caloriesFor(grams: Double): Double = nutrition.caloriesFor(grams)

    /** Protein (grams) in [grams] of this Food. */
    fun proteinFor(grams: Double): Double = nutrition.proteinFor(grams)

    companion object {
        /** A plain (non-recipe) Food. */
        fun plain(id: Long?, name: String, barcode: String?, nutrition: Nutrition): Food =
            Food(id, name, FoodKind.FOOD, barcode, nutrition, cookedWeightG = null)
    }
}
