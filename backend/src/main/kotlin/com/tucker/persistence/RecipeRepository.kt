package com.tucker.persistence

import com.tucker.domain.FoodKind
import com.tucker.domain.Recipe
import com.tucker.domain.RecipeIngredient
import com.tucker.jooq.Tables.RECIPE_INGREDIENT
import org.jooq.DSLContext
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
        recipe.ingredients.forEach { line ->
            val ingredientId = requireNotNull(line.ingredient.id) {
                "ingredient '${line.ingredient.name}' must be persisted before the recipe"
            }
            val rec = dsl.newRecord(RECIPE_INGREDIENT)
            rec.recipeId = recipeId.toInt()
            rec.ingredientFoodId = ingredientId.toInt()
            rec.grams = line.grams.toFloat()
            rec.store()
        }
        return recipe.copy(id = recipeId)
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

    /** Delete a recipe; its ingredient rows cascade away with the Food row. */
    fun delete(id: Long) = foods.delete(id)
}
