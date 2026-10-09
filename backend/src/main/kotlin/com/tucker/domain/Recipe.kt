package com.tucker.domain

/** One ingredient Food weighed into a [Recipe]. */
data class RecipeIngredient(
    val ingredient: Food,
    val grams: Double,
) {
    init {
        require(grams > 0) { "ingredient grams must be > 0, was $grams" }
        // Ingredients are plain Foods only — no nested recipes in v1 (CONTEXT.md),
        // which would invite cycles and compounded estimates.
        require(ingredient.kind == FoodKind.Plain) {
            "a recipe ingredient must be a plain Food, not a RECIPE"
        }
    }
}

/**
 * A Recipe: a composite Food built from weighed ingredients and a measured
 * finished (cooked) weight. It rolls its ingredients up into per-100 g
 * [Nutrition], after which it can be logged exactly like any other Food.
 */
data class Recipe(
    val id: Long,
    val name: String,
    val ingredients: List<RecipeIngredient>,
    val cookedWeightG: Double,
    val tagIds: Set<Long> = emptySet(),
) {
    init {
        require(name.isNotBlank()) { "Recipe name must not be blank" }
        require(ingredients.isNotEmpty()) { "a Recipe needs at least one ingredient" }
    }

    /** Built here rather than in [asFood], so a non-positive cooked weight is refused with the Recipe. */
    private val kind = FoodKind.Recipe(cookedWeightG)

    /** Roll the weighed ingredients up into nutrition per 100 g of the finished dish. */
    fun nutrition(): Nutrition {
        val totalCalories = ingredients.sumOf { it.ingredient.caloriesFor(it.grams) }
        val totalProtein = ingredients.sumOf { it.ingredient.proteinFor(it.grams) }
        val per100g = Nutrition.GRAMS_PER_100G / cookedWeightG
        return Nutrition(
            caloriesPer100g = totalCalories * per100g,
            proteinPer100g = totalProtein * per100g,
            carbsPer100g = null,
            fatPer100g = null,
        )
    }

    /** This Recipe in its persistable [Food] form. */
    fun asFood(): Food = Food(
        id = id,
        name = name,
        kind = kind,
        barcode = null,
        nutrition = nutrition(),
        tagIds = tagIds,
    )
}
