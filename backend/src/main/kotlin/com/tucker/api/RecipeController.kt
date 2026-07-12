package com.tucker.api

import com.tucker.domain.Recipe
import com.tucker.domain.RecipeIngredient
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.RecipeRepository
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
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

/** One ingredient line of a [RecipeResponse]: the ingredient Food and the grams weighed in. */
data class RecipeIngredientResponse(
    val foodId: Long,
    val name: String,
    val grams: Double,
)

/**
 * A Recipe's composition for the read-only view (and the Slice 3 edit form): its
 * ingredient lines (name + grams) and the measured cooked weight. Distinct from
 * [FoodResponse], which carries only the *rolled-up* per-100g the catalog and log
 * picker need.
 */
data class RecipeResponse(
    val id: Long,
    val name: String,
    val cookedWeightG: Double,
    val ingredients: List<RecipeIngredientResponse>,
)

private fun Recipe.toResponse() = RecipeResponse(
    id = persistedId(id),
    name = name,
    cookedWeightG = cookedWeightG,
    ingredients = ingredients.map { line ->
        RecipeIngredientResponse(
            foodId = persistedId(line.ingredient.id),
            name = line.ingredient.name,
            grams = line.grams,
        )
    },
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
        val recipe = request.toRecipe(id = null)
        return recipes.insert(recipe).asFood().toResponse(ingredientCount = recipe.ingredients.size)
    }

    /**
     * Return a Recipe's composition — its ingredient lines and cooked weight — for
     * the read-only view (reused by the Slice 3 edit form). 404 if [id] isn't a
     * recipe (a plain Food or an unknown id), via [ApiExceptionHandler].
     */
    @GetMapping("/{id}")
    fun byId(@PathVariable id: Long): RecipeResponse =
        recipes.findById(id)?.toResponse()
            ?: throw NotFoundException("no recipe with id $id")

    /**
     * Update a Recipe in place, keeping its Food id: re-roll its per-100g and
     * replace its ingredient lines. Because Entries snapshot their calories at log
     * time, editing changes only future logs — never past ones — which is what
     * makes the representative-batch cooked-weight model livable (ADR 0019). 404 if
     * [id] isn't a recipe; the domain's `require` guards surface as 400s.
     */
    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @RequestBody request: CreateRecipeRequest): FoodResponse {
        recipes.findById(id) ?: throw NotFoundException("no recipe with id $id")
        val recipe = request.toRecipe(id = id)
        return recipes.update(recipe).asFood().toResponse(ingredientCount = recipe.ingredients.size)
    }

    /** Resolve this request's ingredient Foods and build a [Recipe] with the given [id]. */
    private fun CreateRecipeRequest.toRecipe(id: Long?): Recipe {
        val byId = foods.findByIds(ingredients.map { it.foodId }).associateBy { it.id }
        val lines = ingredients.map { line ->
            val food = byId[line.foodId]
                ?: throw IllegalArgumentException("no Food with id ${line.foodId}")
            RecipeIngredient(food, line.grams)
        }
        return Recipe(id = id, name = name, ingredients = lines, cookedWeightG = cookedWeightG)
    }
}
