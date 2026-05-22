package com.tucker.domain

/** One ingredient Food weighed into a [Recipe]. */
data class RecipeIngredient(
    val ingredient: Food,
    val grams: Double,
) {
    init {
        require(grams > 0) { "ingredient grams must be > 0, was $grams" }
    }
}

/**
 * A Recipe: a composite Food built from weighed ingredients and a measured
 * finished (cooked) weight. It rolls its ingredients up into per-100 g
 * [Nutrition], after which it can be logged exactly like any other Food.
 */
data class Recipe(
    val id: Long?,
    val name: String,
    val ingredients: List<RecipeIngredient>,
    val cookedWeightG: Double,
) {
    init {
        require(name.isNotBlank()) { "Recipe name must not be blank" }
        require(ingredients.isNotEmpty()) { "a Recipe needs at least one ingredient" }
        require(cookedWeightG > 0) { "cookedWeightG must be > 0, was $cookedWeightG" }
    }

    /** Roll the weighed ingredients up into nutrition per 100 g of the finished dish. */
    fun nutrition(): Nutrition {
        val totalCalories = ingredients.sumOf { it.ingredient.caloriesFor(it.grams) }
        val totalProtein = ingredients.sumOf { it.ingredient.proteinFor(it.grams) }
        val per100g = 100.0 / cookedWeightG
        return Nutrition(
            caloriesPer100g = totalCalories * per100g,
            proteinPer100g = totalProtein * per100g,
            carbsPer100g = null,
            fatPer100g = null,
        )
    }

    /** This Recipe in its persistable [Food] form (kind = RECIPE). */
    fun asFood(): Food = Food(
        id = id,
        name = name,
        kind = FoodKind.RECIPE,
        barcode = null,
        nutrition = nutrition(),
        cookedWeightG = cookedWeightG,
    )
}
