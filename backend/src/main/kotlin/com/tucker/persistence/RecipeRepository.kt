package com.tucker.persistence

import com.tucker.domain.Food
import com.tucker.domain.FoodKind
import com.tucker.domain.Recipe
import com.tucker.domain.RecipeIngredient
import com.tucker.jooq.Tables.FOOD
import com.tucker.jooq.Tables.RECIPE_INGREDIENT
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.jooq.Record3
import org.jooq.Result
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
    private val currentUser: CurrentUser,
) {

    /** The id the next Recipe is built with — a Food's, since a Recipe is stored as one. */
    fun nextId(): Long = foods.nextId()

    /** Persist a Recipe: its rolled-up Food, then its ingredient lines, atomically. */
    @Transactional
    fun insert(recipe: Recipe): Recipe {
        foods.insert(recipe.asFood())
        writeIngredientLines(recipe.id, recipe.ingredients)
        return recipe
    }

    /**
     * Update a Recipe in place: re-roll its Food row (same id — logged Entries and
     * the catalog entry are stable) and replace all its ingredient lines, atomically.
     * Editing recalibrates the representative-batch density (ADR 0019); because
     * Entries snapshot their calories at log time, only future logs see the change.
     *
     * Returns null, having written nothing, when the Recipe is not the caller's.
     *
     * The scoped `foods.update` is the gate, and it has to be read rather than merely
     * issued: `recipe_ingredient` carries no `user_id` of its own — a Recipe *is* a
     * Food row, so its lines are owned through it (ADR 0021: eight owned tables, not
     * nine) — which means neither the delete nor the insert below can express
     * ownership on its own. Letting them run after a no-op update would clear another
     * User's ingredient lines and write these in their place; guarding only the delete
     * is worse still, leaving the insert to graft a foreign line onto their Recipe,
     * where their own scoped read then cannot resolve it and their Recipe 500s
     * forever. `RecipeController` never lets such an id through, but the ownership
     * question is asked once here so that neither statement depends on it having been
     * asked elsewhere.
     */
    @Transactional
    fun update(recipe: Recipe): Food? {
        val updated = foods.update(recipe.asFood()) ?: return null
        dsl.deleteFrom(RECIPE_INGREDIENT)
            .where(RECIPE_INGREDIENT.RECIPE_ID.eq(recipe.id.toInt()))
            .and(
                RECIPE_INGREDIENT.RECIPE_ID.`in`(
                    DSL.select(FOOD.ID).from(FOOD).where(FOOD.USER_ID.eq(currentUser.ownerId)),
                ),
            )
            .execute()
        writeIngredientLines(recipe.id, recipe.ingredients)
        return updated
    }

    /** Insert a Recipe's ingredient lines (shared by insert and update). */
    private fun writeIngredientLines(recipeId: Long, ingredients: List<RecipeIngredient>) {
        ingredients.forEach { line ->
            val rec = dsl.newRecord(RECIPE_INGREDIENT)
            rec.recipeId = recipeId.toInt()
            rec.ingredientFoodId = line.ingredient.id.toInt()
            rec.grams = line.grams
            rec.store()
        }
    }

    /** Load a Recipe with its ingredient Foods, or null if [id] is not a recipe. */
    fun findById(id: Long): Recipe? {
        val food = foods.findById(id) ?: return null
        return when (val kind = food.kind) {
            FoodKind.Plain -> null
            is FoodKind.Recipe -> Recipe(
                id = food.id,
                name = food.name,
                // `orEmpty`, so a Recipe whose lines are gone is refused by `Recipe`'s own
                // invariant, which says what is wrong, rather than by a missing-key throw.
                ingredients = ingredientsOf(listOf(id))[id].orEmpty(),
                cookedWeightG = kind.cookedWeightG,
                tagIds = food.tagIds,
            )
        }
    }

    /**
     * The ingredient lines of every Recipe in [recipeIds], resolved to their Foods in
     * one pass rather than one query per Recipe. A **Micronutrient Intake** reads a
     * whole window's Recipes at once, which is what makes the N+1 worth avoiding.
     *
     * `recipe_ingredient` carries no `user_id` — a Recipe *is* a Food row, so its
     * lines are owned through it (ADR 0021: eight owned tables, not nine) — so the
     * ownership predicate sits on the Recipe's Food row. Belt-and-braces rather than
     * a reachable guard, as in [recipesUsingIngredient]: both callers resolve their
     * ids through a scoped read first, so a foreign Recipe never reaches here.
     */
    fun ingredientsOf(recipeIds: Collection<Long>): Map<Long, List<RecipeIngredient>> {
        if (recipeIds.isEmpty()) return emptyMap()
        val rows = ingredientRowsOf(recipeIds)
        val ingredientFoods = foods
            .findByIds(rows.map { it.value2().toLong() }.distinct())
            .associateBy { it.id }
        return rows.groupBy({ it.value1().toLong() }) { row ->
            val ingredient = ingredientFoods[row.value2().toLong()]
                ?: error("ingredient food ${row.value2()} is missing")
            RecipeIngredient(ingredient, row.value3())
        }
    }

    /** Each line of [recipeIds] as (recipe, ingredient Food, grams), in the order it was added. */
    private fun ingredientRowsOf(recipeIds: Collection<Long>): Result<Record3<Int, Int, Double>> =
        dsl.select(
            RECIPE_INGREDIENT.RECIPE_ID,
            RECIPE_INGREDIENT.INGREDIENT_FOOD_ID,
            RECIPE_INGREDIENT.GRAMS,
        )
            .from(RECIPE_INGREDIENT)
            .join(FOOD).on(FOOD.ID.eq(RECIPE_INGREDIENT.RECIPE_ID))
            .where(RECIPE_INGREDIENT.RECIPE_ID.`in`(recipeIds.map { it.toInt() }))
            .and(FOOD.USER_ID.eq(currentUser.ownerId))
            .orderBy(RECIPE_INGREDIENT.ID)
            .fetch()

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

    /**
     * The distinct names of Recipes that use the Food [foodId] as an ingredient,
     * ordered for a stable message. Empty when the Food is not an ingredient of any
     * Recipe. A deterministic existence query — the join to the recipe's Food row
     * naturally ignores any orphaned ingredient line — mirroring
     * [EntryRepository.referencesFood], not a caught FK violation; [FoodService]
     * uses it to name what blocks a delete.
     *
     * Scoped to the current User's Recipes (ADR 0021). Belt-and-braces rather than a
     * reachable guard — an ingredient line can only name a Food its Recipe's owner
     * has — but these names are read back to whoever tried the delete, so it is worth
     * the predicate that this can never answer "you can't, because of «somebody
     * else's dinner»".
     */
    fun recipesUsingIngredient(foodId: Long): List<String> =
        dsl.selectDistinct(FOOD.NAME)
            .from(RECIPE_INGREDIENT)
            .join(FOOD).on(FOOD.ID.eq(RECIPE_INGREDIENT.RECIPE_ID))
            .where(RECIPE_INGREDIENT.INGREDIENT_FOOD_ID.eq(foodId.toInt()))
            .and(FOOD.USER_ID.eq(currentUser.ownerId))
            .orderBy(FOOD.NAME)
            .fetch(FOOD.NAME)
}
