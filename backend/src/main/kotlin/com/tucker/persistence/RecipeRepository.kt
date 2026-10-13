package com.tucker.persistence

import com.tucker.domain.Food
import com.tucker.domain.FoodKind
import com.tucker.domain.Recipe
import com.tucker.domain.RecipeIngredient
import com.tucker.jooq.Tables.FOOD
import com.tucker.jooq.Tables.RECIPE_INGREDIENT
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.jooq.Record2
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
        // `orEmpty`, so a Recipe whose lines are gone is refused by `Recipe`'s own
        // invariant, which says what is wrong, rather than by a missing-key throw.
        return recipeOf(food, ingredientsOf(listOf(id))[id].orEmpty())
    }

    /**
     * The ingredient lines of every Recipe in [recipeIds], resolved to their Foods in
     * one pass rather than one query per Recipe. A **Micronutrient Intake** reads a
     * whole window's Recipes at once, which is what makes the N+1 worth avoiding.
     *
     * `recipe_ingredient` carries no `user_id` — a Recipe *is* a Food row, so its
     * lines are owned through it (ADR 0021: eight owned tables, not nine) — so the
     * ownership predicate sits on the Recipe's Food row. Belt-and-braces rather than
     * a reachable guard, as in [recipesUsing]: both callers resolve their
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
     * The distinct names of the caller's Recipes that use the Food [foodId] as an
     * ingredient, ordered for a stable message — what a delete names when it refuses.
     * A projection rather than [recipesUsing] narrowed: the guard only names them.
     */
    fun recipeNamesUsing(foodId: Long): List<String> =
        dsl.recipeRowsUsing(foodId, currentUser.ownerId).map { it.value2() }.distinct()

    /**
     * The caller's Recipes that use the Food [foodId] as an ingredient, by name, each
     * loaded whole beside its row as stored — whose figures are the ones saved, where
     * the Recipe's own are a fresh roll-up of its lines.
     */
    fun recipesUsing(foodId: Long): List<Pair<Food, Recipe>> {
        val ids = dsl.recipeRowsUsing(foodId, currentUser.ownerId).map { it.value1().toLong() }
        // One read for the Recipes' rows and one for all their lines, whatever their number.
        val recipeFoods = foods.findByIds(ids).associateBy { it.id }
        val lines = ingredientsOf(ids)
        return ids.mapNotNull { id ->
            val stored = recipeFoods[id] ?: return@mapNotNull null
            recipeOf(stored, lines[id].orEmpty())?.let { stored to it }
        }
    }
}

/** [food] as the Recipe [ingredients] compose, or null if it is not a recipe. */
private fun recipeOf(food: Food, ingredients: List<RecipeIngredient>): Recipe? =
    when (val kind = food.kind) {
        FoodKind.Plain -> null
        is FoodKind.Recipe -> Recipe(
            id = food.id,
            name = food.name,
            ingredients = ingredients,
            cookedWeightG = kind.cookedWeightG,
            tagIds = food.tagIds,
        )
    }

/**
 * Each Recipe of [ownerId] that uses the Food [foodId] as an ingredient, as (id, name),
 * ordered by name. The join to the Recipe's Food row ignores any orphaned ingredient line.
 *
 * Scoped to the owner's Recipes (ADR 0021). Belt-and-braces rather than a reachable
 * guard — an ingredient line can only name a Food its Recipe's owner has — but a delete
 * reads these names back to whoever tried it, so it is worth the predicate that this
 * can never answer "you can't, because of «somebody else's dinner»".
 */
private fun DSLContext.recipeRowsUsing(foodId: Long, ownerId: Int): Result<Record2<Int, String>> =
    selectDistinct(RECIPE_INGREDIENT.RECIPE_ID, FOOD.NAME)
        .from(RECIPE_INGREDIENT)
        .join(FOOD).on(FOOD.ID.eq(RECIPE_INGREDIENT.RECIPE_ID))
        .where(RECIPE_INGREDIENT.INGREDIENT_FOOD_ID.eq(foodId.toInt()))
        .and(FOOD.USER_ID.eq(ownerId))
        .orderBy(FOOD.NAME)
        .fetch()
