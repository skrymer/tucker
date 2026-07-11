package com.tucker.api

import com.tucker.domain.Recipe
import com.tucker.domain.RecipeIngredient
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.RecipeRepository
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/** One ingredient line of a [CreateRecipeRequest]: an existing Food and the grams weighed in. */
data class CreateRecipeIngredient(
    val foodId: Long,
    val grams: Double,
)

/**
 * Request to create a [Recipe] — a composite Food (`kind = RECIPE`) whose per-100g
 * nutrition is derived from its ingredient Foods and the finished dish's cooked
 * weight (CONTEXT.md, Recipe). The user never types the finished per-100g: it is
 * rolled up from the weighed ingredients, exactly like every other Food's calories.
 */
data class CreateRecipeRequest(
    val name: String,
    val cookedWeightG: Double,
    val ingredients: List<CreateRecipeIngredient>,
)

@RestController
@RequestMapping("/api/recipes")
class RecipeController(
    private val recipes: RecipeRepository,
    private val foods: FoodRepository,
) {

    /**
     * Build a Recipe from existing ingredient Foods + a cooked weight, roll up its
     * nutrition, persist it, and return the rolled-up [FoodResponse] (`kind = RECIPE`).
     * The domain's `require` guards (blank name, no ingredients, non-positive grams
     * or cooked weight) surface as 400s via [ApiExceptionHandler].
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody request: CreateRecipeRequest): FoodResponse {
        val byId = foods.findByIds(request.ingredients.map { it.foodId }).associateBy { it.id }
        val ingredients = request.ingredients.map { line ->
            val food = byId[line.foodId]
                ?: throw IllegalArgumentException("no Food with id ${line.foodId}")
            RecipeIngredient(food, line.grams)
        }
        val recipe = Recipe(
            id = null,
            name = request.name,
            ingredients = ingredients,
            cookedWeightG = request.cookedWeightG,
        )
        return recipes.insert(recipe).asFood().toResponse()
    }
}
