package com.tucker.persistence

import com.tucker.domain.FoodKind
import com.tucker.domain.Recipe
import com.tucker.domain.RecipeIngredient
import com.tucker.jooq.Tables.FOOD
import com.tucker.jooq.Tables.RECIPE_INGREDIENT
import org.jooq.DSLContext
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

/**
 * Persistence for [Recipe] aggregates. A Recipe is stored as a Food row
 * (kind = RECIPE, carrying the rolled-up nutrition) plus its ingredient rows.
 */
@Repository
class RecipeRepository(
    private val dsl: DSLContext,
    private val foods: FoodRepository,
) {

    /** Persist a Recipe: its rolled-up Food, then its ingredient lines, atomically. */
    @Transactional
    fun insert(recipe: Recipe): Recipe {
        val recipeFood = foods.insert(recipe.asFood())
        val recipeId = recipeFood.id!!
        writeIngredientLines(recipeId, recipe.ingredients)
        return recipe.copy(id = recipeId)
    }

    /**
     * Update a Recipe in place: re-roll its Food row (same id — logged Entries and
     * the catalog entry are stable) and replace all its ingredient lines, atomically.
     * Editing recalibrates the representative-batch density (ADR 0019); because
     * Entries snapshot their calories at log time, only future logs see the change.
     */
    @Transactional
    fun update(recipe: Recipe): Recipe {
        val recipeId = requireNotNull(recipe.id) { "cannot update a Recipe without an id" }
        foods.update(recipe.asFood())
        dsl.deleteFrom(RECIPE_INGREDIENT)
            .where(RECIPE_INGREDIENT.RECIPE_ID.eq(recipeId.toInt()))
            .execute()
        writeIngredientLines(recipeId, recipe.ingredients)
        return recipe
    }

    /** Insert a Recipe's ingredient lines (shared by insert and update). */
    private fun writeIngredientLines(recipeId: Long, ingredients: List<RecipeIngredient>) {
        ingredients.forEach { line ->
            val ingredientId = requireNotNull(line.ingredient.id) {
                "ingredient '${line.ingredient.name}' must be persisted before the recipe"
            }
            val rec = dsl.newRecord(RECIPE_INGREDIENT)
            rec.recipeId = recipeId.toInt()
            rec.ingredientFoodId = ingredientId.toInt()
            rec.grams = line.grams.toFloat()
            rec.store()
        }
    }

    /** Load a Recipe with its ingredient Foods, or null if [id] is not a recipe. */
    fun findById(id: Long): Recipe? {
        val food = foods.findById(id)?.takeIf { it.kind == FoodKind.RECIPE } ?: return null

        val ingredientRows = dsl.selectFrom(RECIPE_INGREDIENT)
            .where(RECIPE_INGREDIENT.RECIPE_ID.eq(id.toInt()))
            .orderBy(RECIPE_INGREDIENT.ID)
            .fetch()
        val ingredientFoods = foods
            .findByIds(ingredientRows.map { it.ingredientFoodId.toLong() })
            .associateBy { it.id }
        val ingredients = ingredientRows.map { row ->
            val ingredient = ingredientFoods[row.ingredientFoodId.toLong()]
                ?: error("ingredient food ${row.ingredientFoodId} is missing")
            RecipeIngredient(ingredient, row.grams.toDouble())
        }

        return Recipe(
            id = food.id,
            name = food.name,
            ingredients = ingredients,
            cookedWeightG = requireNotNull(food.cookedWeightG) {
                "recipe food ${food.id} has no cooked weight"
            },
        )
    }

    /**
     * The ingredient-line count for each recipe id, in a single grouped query.
     * A recipe with no rows (which the domain forbids) is simply absent from the
     * map. Used by the catalog to show "N ingredients" without an N+1.
     */
    fun ingredientCounts(recipeIds: Collection<Long>): Map<Long, Int> {
        if (recipeIds.isEmpty()) return emptyMap()
        return dsl.select(RECIPE_INGREDIENT.RECIPE_ID, DSL.count())
            .from(RECIPE_INGREDIENT)
            .where(RECIPE_INGREDIENT.RECIPE_ID.`in`(recipeIds.map { it.toInt() }))
            .groupBy(RECIPE_INGREDIENT.RECIPE_ID)
            .fetch()
            .associate { (recipeId, count) -> recipeId!!.toLong() to count }
    }

    /** Delete a recipe; its ingredient rows cascade away with the Food row. */
    fun delete(id: Long) = foods.delete(id)

    /**
     * The distinct names of Recipes that use the Food [foodId] as an ingredient,
     * ordered for a stable message. Empty when the Food is not an ingredient of any
     * Recipe. A deterministic existence query — the join to the recipe's Food row
     * naturally ignores any orphaned ingredient line — mirroring
     * [EntryRepository.referencesFood], not a caught FK violation; [FoodService]
     * uses it to name what blocks a delete.
     */
    fun recipesUsingIngredient(foodId: Long): List<String> =
        dsl.selectDistinct(FOOD.NAME)
            .from(RECIPE_INGREDIENT)
            .join(FOOD).on(FOOD.ID.eq(RECIPE_INGREDIENT.RECIPE_ID))
            .where(RECIPE_INGREDIENT.INGREDIENT_FOOD_ID.eq(foodId.toInt()))
            .orderBy(FOOD.NAME)
            .fetch(FOOD.NAME)
}
