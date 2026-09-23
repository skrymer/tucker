package com.tucker.persistence

import com.tucker.domain.Food
import com.tucker.domain.FoodKind
import com.tucker.domain.Nutrition
import com.tucker.jooq.Tables.FOOD
import com.tucker.jooq.Tables.FOOD_TAG
import com.tucker.jooq.tables.records.FoodRecord
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

/**
 * Persistence for [Food] (plain foods and recipe foods alike).
 *
 * Every query is scoped to the current User (ADR 0021), which is why no method here
 * takes an owner: the caller cannot pass the wrong one because it cannot pass one at
 * all. A row belonging to somebody else simply is not there, so `findById` returns
 * null for it exactly as it does for an id nobody owns — which is what lets the API
 * answer without revealing that the row exists.
 */
@Repository
class FoodRepository(
    private val dsl: DSLContext,
    private val currentUser: CurrentUser,
) {

    fun findById(id: Long): Food? =
        dsl.selectFrom(FOOD)
            .where(FOOD.ID.eq(id.toInt()))
            .and(FOOD.USER_ID.eq(currentUser.ownerId))
            .fetchOne()?.toFood()?.let { wearingTags(listOf(it)).single() }

    /**
     * The caller's own Food for [barcode], if they have saved one. Scoped like every
     * other read, which is what makes a scan produce *their* Food: the shared
     * per-barcode lookup cache still spares the Provider a second call (ADR 0006),
     * but the row it fills in is theirs alone (ADR 0021).
     */
    fun findByBarcode(barcode: String): Food? =
        dsl.selectFrom(FOOD)
            .where(FOOD.BARCODE.eq(barcode))
            .and(FOOD.USER_ID.eq(currentUser.ownerId))
            .fetchOne()?.toFood()?.let { wearingTags(listOf(it)).single() }

    fun findAll(): List<Food> =
        dsl.selectFrom(FOOD)
            .where(FOOD.USER_ID.eq(currentUser.ownerId))
            .orderBy(FOOD.NAME.lower())
            .fetch().map { it.toFood() }.let(::wearingTags)

    /** Load every Food in [ids] in a single query (used to resolve recipe ingredients). */
    fun findByIds(ids: Collection<Long>): List<Food> {
        if (ids.isEmpty()) return emptyList()
        return dsl.selectFrom(FOOD)
            .where(FOOD.ID.`in`(ids.map { it.toInt() }))
            .and(FOOD.USER_ID.eq(currentUser.ownerId))
            .fetch().map { it.toFood() }.let(::wearingTags)
    }

    fun insert(food: Food): Food {
        val rec = dsl.newRecord(FOOD)
        rec.applyFrom(food)
        rec.store()
        return food.copy(id = rec.id!!.toLong())
    }

    /**
     * Update an existing Food's row in place, keeping its id (so logged Entries
     * still resolve and the catalog entry is stable). Used to recalibrate a
     * Recipe's rolled-up nutrition without minting a new Food.
     *
     * Returns null when [food] is not the caller's, having changed nothing — which is
     * what lets a caller composing several statements find out before it writes the
     * rest of them ([RecipeRepository.update] does exactly that).
     *
     * The owner is in the WHERE, not merely implied by a scoped read upstream:
     * `applyFrom` writes `user_id`, so a key-only UPDATE would not just overwrite
     * somebody else's Food, it would quietly re-own it. The Tags it wears are written
     * only once that row is known to be the caller's, since the link carries no owner
     * of its own (ADR 0021).
     */
    @Transactional
    fun update(food: Food): Food? {
        val id = requireNotNull(food.id) { "cannot update a Food without an id" }
        val rec = dsl.newRecord(FOOD)
        rec.applyFrom(food)
        val rowsChanged = dsl.update(FOOD)
            .set(rec)
            .where(FOOD.ID.eq(id.toInt()))
            .and(FOOD.USER_ID.eq(currentUser.ownerId))
            .execute()
        if (rowsChanged == 0) return null
        dsl.replaceTagsOf(id.toInt(), food.tagIds)
        return food
    }

    /** Project a [Food]'s fields onto a [FoodRecord] (shared by insert and update). */
    private fun FoodRecord.applyFrom(food: Food) {
        userId = currentUser.ownerId
        name = food.name
        kind = food.kind.name
        barcode = food.barcode
        caloriesPer_100g = food.nutrition.caloriesPer100g
        proteinPer_100g = food.nutrition.proteinPer100g
        carbsPer_100g = food.nutrition.carbsPer100g
        fatPer_100g = food.nutrition.fatPer100g
        cookedWeightG = food.cookedWeightG
        referenceFoodId = food.referenceFoodId?.toInt()
    }

    /** [foods] each carrying the ids of the Tags it wears, read in one query. */
    private fun wearingTags(foods: List<Food>): List<Food> {
        if (foods.isEmpty()) return foods
        val tagIdsByFood = dsl.select(FOOD_TAG.FOOD_ID, FOOD_TAG.TAG_ID)
            .from(FOOD_TAG)
            .where(FOOD_TAG.FOOD_ID.`in`(foods.map { it.id!!.toInt() }))
            .fetchGroups({ it[FOOD_TAG.FOOD_ID]!!.toLong() }, { it[FOOD_TAG.TAG_ID]!!.toLong() })
        return foods.map { it.copy(tagIds = tagIdsByFood[it.id].orEmpty().toSet()) }
    }

    fun delete(id: Long) {
        dsl.deleteFrom(FOOD)
            .where(FOOD.ID.eq(id.toInt()))
            .and(FOOD.USER_ID.eq(currentUser.ownerId))
            .execute()
    }

    private fun FoodRecord.toFood(): Food = Food(
        id = id!!.toLong(),
        name = name,
        kind = FoodKind.valueOf(kind),
        barcode = barcode,
        nutrition = Nutrition(
            caloriesPer100g = caloriesPer_100g,
            proteinPer100g = proteinPer_100g,
            carbsPer100g = carbsPer_100g,
            fatPer100g = fatPer_100g,
        ),
        cookedWeightG = cookedWeightG,
        referenceFoodId = referenceFoodId?.toLong(),
    )
}

/** Make [tagIds] exactly the Tags the Food [foodId] wears, in two statements however many. */
private fun DSLContext.replaceTagsOf(foodId: Int, tagIds: Set<Long>) {
    deleteFrom(FOOD_TAG).where(FOOD_TAG.FOOD_ID.eq(foodId)).execute()
    if (tagIds.isEmpty()) return
    tagIds.fold(insertInto(FOOD_TAG, FOOD_TAG.FOOD_ID, FOOD_TAG.TAG_ID)) { rows, tagId ->
        rows.values(foodId, tagId.toInt())
    }.execute()
}
