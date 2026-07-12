package com.tucker.service

import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.RecipeRepository
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
) {

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
