package com.tucker.domain

/** Whether a Food is a plain food or a composite [Recipe]. */
enum class FoodKind { FOOD, RECIPE }

/**
 * A reusable definition of something edible — a name plus [Nutrition] per 100 g.
 * A Recipe is a Food with [kind] = RECIPE; see [Recipe] for how one is built.
 *
 * [referenceFoodId] is the **Reference Food** this Food borrows its micronutrients
 * from, or null while it is unmatched — which is where every Food starts and where
 * most of them stay (ADR 0027). A pointer rather than a copy, so a later release of
 * the database reaches every Food already matched to it.
 */
data class Food(
    val id: Long?,
    val name: String,
    val kind: FoodKind,
    val barcode: String?,
    val nutrition: Nutrition,
    val cookedWeightG: Double?,
    val referenceFoodId: Long? = null,
    val tagIds: Set<Long> = emptySet(),
) {
    init {
        require(name.isNotBlank()) { "Food name must not be blank" }
        require(cookedWeightG == null || cookedWeightG > 0) {
            "cookedWeightG must be > 0 when set, was $cookedWeightG"
        }
        require(kind == FoodKind.RECIPE || cookedWeightG == null) {
            "cookedWeightG only applies to a RECIPE"
        }
        // And a Recipe always has one: it is how a portion is sliced out of the batch
        // (ADR 0019), so every reader needs it. Asked here rather than by each of them,
        // or one impossible row answers with a different status per reader.
        require(kind != FoodKind.RECIPE || cookedWeightG != null) {
            "a RECIPE is sliced out of its cooked weight, so it must have one"
        }
        // A Recipe's composition is already known, so its micronutrients roll up from
        // whichever ingredients are matched — which always beats matching the finished
        // dish to a generic prepared one (CONTEXT.md, ADR 0027).
        require(kind != FoodKind.RECIPE || referenceFoodId == null) {
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

    /** This Food wearing exactly [tagIds]. */
    fun retagged(tagIds: Collection<Long>): Food = copy(tagIds = tagIds.toSet())

    companion object {
        /** A plain (non-recipe) Food. */
        fun plain(id: Long?, name: String, barcode: String?, nutrition: Nutrition): Food =
            Food(id, name, FoodKind.FOOD, barcode, nutrition, cookedWeightG = null)
    }
}
