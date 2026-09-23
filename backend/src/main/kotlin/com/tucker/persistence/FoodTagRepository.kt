package com.tucker.persistence

import com.tucker.domain.Food
import com.tucker.jooq.Tables.FOOD_TAG
import org.jooq.DSLContext
import org.springframework.stereotype.Repository

/**
 * Which Tags a Food wears. The link has no owner of its own — it is owned through its
 * Food, the way `recipe_ingredient` is through its Recipe (ADR 0021) — so the Food is
 * re-checked as the caller's before its links are touched.
 */
@Repository
class FoodTagRepository(
    private val dsl: DSLContext,
    private val foods: FoodRepository,
) {

    /**
     * Persist exactly [food]'s Tags. Apart from [FoodRepository.update], which writes the
     * Food's own row: a Recipe is recalibrated through that from a Food rebuilt out of
     * its ingredients, which knows nothing of the Tags it wears.
     *
     * Returns null, having changed nothing, when [food] is not the caller's.
     */
    fun replace(food: Food): Food? {
        val id = requireNotNull(food.id) { "cannot tag a Food without an id" }
        foods.findById(id) ?: return null
        dsl.deleteFrom(FOOD_TAG).where(FOOD_TAG.FOOD_ID.eq(id.toInt())).execute()
        food.tagIds.forEach { tagId ->
            dsl.insertInto(FOOD_TAG, FOOD_TAG.FOOD_ID, FOOD_TAG.TAG_ID).values(id.toInt(), tagId.toInt()).execute()
        }
        return food
    }
}
