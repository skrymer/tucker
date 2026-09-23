package com.tucker.api

import com.tucker.domain.Food
import com.tucker.domain.FoodKind
import com.tucker.persistence.RecipeRepository
import com.tucker.persistence.ReferenceFoodRepository
import com.tucker.persistence.TagRepository
import org.springframework.stereotype.Component

/**
 * Foods on the wire, each carrying what only another table knows: a Recipe's
 * ingredient count, the name of what a Food borrows its micronutrients from, and the
 * Tags it carries. Three queries however long the list, and one place that decides what
 * a `FoodResponse` says, so a Food does not read differently for having arrived by a
 * different route.
 */
@Component
class FoodDescriber(
    private val recipes: RecipeRepository,
    private val referenceFoods: ReferenceFoodRepository,
    private val tags: TagRepository,
) {

    fun describe(foods: List<Food>): List<FoodResponse> {
        val counts = recipes.ingredientCounts(foods.filter { it.kind == FoodKind.RECIPE }.mapNotNull { it.id })
        val matched = referenceFoods.namesOf(foods.mapNotNull { it.referenceFoodId }.distinct())
        val worn = tags.findByIds(foods.flatMap { it.tagIds }.distinct()).associateBy { it.id }
        return foods.map {
            it.toResponse(
                tags = it.tagIds.mapNotNull(worn::get),
                ingredientCount = counts[it.id],
                referenceFoodName = matched[it.referenceFoodId],
            )
        }
    }

    fun describe(food: Food): FoodResponse = describe(listOf(food)).single()
}
