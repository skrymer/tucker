package com.tucker.service

import com.tucker.api.NotFoundException
import com.tucker.domain.Food
import com.tucker.domain.FrequentFoods
import com.tucker.domain.Recipe
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.RecipeRepository
import com.tucker.persistence.ReferenceFoodRepository
import com.tucker.persistence.TagRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

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
    private val referenceFoods: ReferenceFoodRepository,
) {

    /**
     * The caller's **Frequent Foods** (ADR 0028) over the window [from]..[to], both
     * bounds inclusive — at most ten, most logged first.
     *
     * Read-only transactional for [com.tucker.api.IntakeBreakdownController.breakdown]'s
     * reason: the counts and the Foods they name must describe one instant.
     */
    @Transactional(readOnly = true)
    fun frequent(from: LocalDate, to: LocalDate): List<Food> {
        // Checked before the read rather than left to `rank`'s own guard, which
        // Kotlin's argument evaluation would reach only after the query had run.
        FrequentFoods.requireWindow(from, to)
        val ranked = FrequentFoods.rank(from, to, entries.logCountsBetween(from, to))
        val byId = foods.findByIds(ranked.map { it.foodId }).associateBy { it.id }
        // `getValue`, not a lookup that tolerates a miss: deleting a Food an Entry
        // names is refused, so a ranked id with no Food is a bug rather than a tile
        // to leave out.
        return ranked.map { byId.getValue(it.foodId) }
    }

    /**
     * Match [id] to a **Reference Food**, so it borrows that food's micronutrients
     * (ADR 0027). A claim a User makes, never one Tucker infers — nothing is matched
     * silently, because a wrong match reports confident figures for food that was
     * never eaten.
     */
    fun match(id: Long, referenceFoodId: Long): Food {
        val food = foods.findById(id) ?: throw NotFoundException("no Food with id $id")
        // Resolved before the write rather than left to the foreign key, which would
        // surface an unknown id as a 500 rather than as the plain 404 it is.
        val reference = referenceFoods.findById(referenceFoodId)
            ?: throw NotFoundException("no Reference Food with id $referenceFoodId")
        val matched = food.matchedTo(reference)
        foods.update(matched)
        return matched
    }

    /**
     * Take back [id]'s borrow, leaving it contributing no micronutrients again.
     *
     * A match is reversible for the reason it is confirmed in the first place: a
     * wrong one is worse than none (ADR 0027). Idempotent, like every other delete
     * here — unmatching a Food that is already unmatched changes nothing.
     */
    fun unmatch(id: Long) {
        val food = foods.findById(id) ?: return
        foods.update(food.unmatched())
    }

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
        tags.findByIds(tagIds).map { it.id }.containsAll(tagIds)

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
