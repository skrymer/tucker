package com.tucker.domain

/** Whether a Food is a plain food or a composite [Recipe], and what only a Recipe has. */
sealed interface FoodKind {
    /** A food eaten as it is. */
    data object Plain : FoodKind

    /**
     * A Food built from weighed ingredients. [cookedWeightG] is the finished batch's
     * weight, which a portion is sliced out of (ADR 0019).
     */
    data class Recipe(val cookedWeightG: Double) : FoodKind {
        init {
            require(cookedWeightG > 0) { "cookedWeightG must be > 0, was $cookedWeightG" }
        }
    }
}

/** The macros per 100 g a User supplies for a Food, fibre and alcohol optional; calories are derived from them. */
data class Macros(
    val proteinPer100g: Double,
    val carbsPer100g: Double,
    val fatPer100g: Double,
    val fibrePer100g: Double? = null,
    val alcoholPer100g: Double? = null,
) {
    /** The [Nutrition] these macros make, calories derived from them. */
    fun nutrition(): Nutrition = Nutrition.fromMacros(this)
}

/**
 * A reusable definition of something edible — a name plus [Nutrition] per 100 g.
 * A Recipe is a Food of kind [FoodKind.Recipe]; see [Recipe] for how one is built.
 *
 * [referenceFoodId] is the **Reference Food** this Food borrows its micronutrients
 * from, or null while it is unmatched — which is where every Food starts and where
 * most of them stay (ADR 0027). A pointer rather than a copy, so a later release of
 * the database reaches every Food already matched to it.
 */
data class Food(
    val id: Long,
    val name: String,
    val kind: FoodKind,
    val barcode: String?,
    val nutrition: Nutrition,
    val referenceFoodId: Long? = null,
    val tagIds: Set<Long> = emptySet(),
) {
    init {
        require(name.isNotBlank()) { "Food name must not be blank" }
        // A Recipe's composition is already known, so its micronutrients roll up from
        // whichever ingredients are matched — which always beats matching the finished
        // dish to a generic prepared one (CONTEXT.md, ADR 0027).
        require(kind !is FoodKind.Recipe || referenceFoodId == null) {
            "a Recipe borrows its micronutrients from its ingredients, so it can't be matched"
        }
    }

    /** Calories in [grams] of this Food. */
    fun caloriesFor(grams: Double): Double = nutrition.caloriesFor(grams)

    /** Protein (grams) in [grams] of this Food. */
    fun proteinFor(grams: Double): Double = nutrition.proteinFor(grams)

    /**
     * This Food borrowing [reference]'s micronutrients (ADR 0027).
     *
     * A pointer rather than a copy, so a later AFCD release reaches every Food
     * already matched. Refused for a Recipe by the invariant above — which is why
     * the transition lives here rather than in a caller assigning the field.
     */
    fun matchedTo(reference: ReferenceFood): Food = copy(referenceFoodId = reference.id)

    /** This Food borrowing nothing again. Idempotent, like the endpoint that calls it. */
    fun unmatched(): Food = copy(referenceFoodId = null)

    /** This Food carrying exactly [tagIds]. */
    fun retagged(tagIds: Collection<Long>): Food = copy(tagIds = tagIds.toSet())

    /**
     * This Food with the old values replaced as never having been true (ADR 0037).
     * Calories are re-derived from [macros]; the barcode and the Reference Food match
     * are kept. Refused for a Recipe, whose macros come from its composition.
     */
    fun corrected(name: String, macros: Macros, tagIds: Collection<Long>): Food {
        require(kind is FoodKind.Plain) { "a Recipe is corrected through its composition, not its macros" }
        return copy(
            name = name,
            tagIds = tagIds.toSet(),
            nutrition = macros.nutrition(),
        )
    }

    companion object {
        /** A plain (non-recipe) Food. */
        fun plain(id: Long, name: String, barcode: String?, nutrition: Nutrition): Food =
            Food(id, name, FoodKind.Plain, barcode, nutrition)
    }
}
