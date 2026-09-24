package com.tucker.service

import com.tucker.domain.Food
import com.tucker.domain.Recipe
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.RecipeRepository
import com.tucker.persistence.TagRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Application logic for Foods — the cross-aggregate rules that span the Food
 * catalog, the Entry history, and the Recipes that compose it (ADR 0001:
 * cross-aggregate logic lives in a thin service, not the controller).
 */
@Service
class FoodService(
    private val foods: FoodRepository,
    private val entries: EntryRepository,
    private val recipes: RecipeRepository,
    private val tags: TagRepository,
) {

    /**
     * Add [food] to the catalog carrying its Tags, or return null having written
     * nothing when one of them is not the caller's (ADR 0033).
     */
    @Transactional
    fun create(food: Food): Food? = if (ownsAll(food.tagIds)) foods.insert(food) else null

    /**
     * Add [recipe] to the catalog carrying its Tags, or return null having written
     * nothing when one of them is not the caller's (ADR 0033).
     */
    @Transactional
    fun createRecipe(recipe: Recipe): Food? = if (ownsAll(recipe.tagIds)) recipes.insert(recipe).asFood() else null

    /**
     * Replace the stored Recipe with [recipe] — composition and Tags alike — or return
     * null having written nothing when the Recipe or one of the Tags is not the caller's.
     */
    @Transactional
    fun updateRecipe(recipe: Recipe): Food? = if (ownsAll(recipe.tagIds)) recipes.update(recipe) else null

    /**
     * Put exactly [tagIds] on the Food [id], or return null having written nothing when
     * the Food or one of the Tags is not the caller's (ADR 0033).
     */
    @Transactional
    fun retag(id: Long, tagIds: Collection<Long>): Food? {
        if (!ownsAll(tagIds)) return null
        return foods.findById(id)?.let { foods.update(it.retagged(tagIds)) }
    }

    private fun ownsAll(tagIds: Collection<Long>): Boolean =
        tags.findByIds(tagIds).mapNotNull { it.id }.containsAll(tagIds)

    /**
     * Remove a Food from the catalog, enforcing that a Food referenced by at least
     * one Entry — or used as an ingredient in a Recipe — **cannot be deleted**:
     * Entries are permanent history and a Recipe's ingredients are part of its
     * definition (CONTEXT.md, Food). Each rule is a deterministic existence check
     * (not a caught FK violation); a referenced Food is rejected with an
     * [IllegalArgumentException] naming what references it, which the API layer maps
     * to a 400, and it stays in the catalog. Deleting an absent Food is an
     * idempotent no-op.
     */
    @Transactional
    fun delete(id: Long) {
        val food = foods.findById(id) ?: return
        require(!entries.referencesFood(id)) {
            "${food.name} has logged Entries and can't be deleted."
        }
        val usedInRecipes = recipes.recipesUsingIngredient(id)
        require(usedInRecipes.isEmpty()) {
            "${food.name} is an ingredient of ${usedInRecipes.joinToString(", ")} and can't be deleted."
        }
        foods.delete(id)
    }
}
