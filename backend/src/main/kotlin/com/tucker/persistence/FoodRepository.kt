package com.tucker.persistence

import com.tucker.domain.Food
import com.tucker.domain.FoodKind
import com.tucker.domain.Nutrition
import com.tucker.jooq.Tables.FOOD
import com.tucker.jooq.tables.records.FoodRecord
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.springframework.stereotype.Repository

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
            .and(FOOD.USER_ID.eq(owner))
            .fetchOne()?.toFood()

    /**
     * The caller's own Food for [barcode], if they have saved one. Scoped like every
     * other read, which is what makes a scan produce *their* Food: the shared
     * per-barcode lookup cache still spares the Provider a second call (ADR 0006),
     * but the row it fills in is theirs alone (ADR 0021).
     */
    fun findByBarcode(barcode: String): Food? =
        dsl.selectFrom(FOOD)
            .where(FOOD.BARCODE.eq(barcode))
            .and(FOOD.USER_ID.eq(owner))
            .fetchOne()?.toFood()

    fun findAll(): List<Food> =
        dsl.selectFrom(FOOD)
            .where(FOOD.USER_ID.eq(owner))
            .orderBy(FOOD.NAME.lower())
            .fetch().map { it.toFood() }

    /** Load every Food in [ids] in a single query (used to resolve recipe ingredients). */
    fun findByIds(ids: Collection<Long>): List<Food> {
        if (ids.isEmpty()) return emptyList()
        return dsl.selectFrom(FOOD)
            .where(FOOD.ID.`in`(ids.map { it.toInt() }))
            .and(FOOD.USER_ID.eq(owner))
            .fetch().map { it.toFood() }
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
     */
    fun update(food: Food): Food {
        val id = requireNotNull(food.id) { "cannot update a Food without an id" }
        val rec = dsl.newRecord(FOOD)
        rec.applyFrom(food)
        // The owner is in the WHERE, not just implied by a scoped read upstream.
        // `applyFrom` writes user_id, so a key-only UPDATE would not merely overwrite
        // somebody else's Food — it would quietly re-own it.
        dsl.update(FOOD)
            .set(rec)
            .where(FOOD.ID.eq(id.toInt()))
            .and(FOOD.USER_ID.eq(owner))
            .execute()
        return food
    }

    /** Project a [Food]'s fields onto a [FoodRecord] (shared by insert and update). */
    /** The current User's id, in the width the `user_id` column is generated as. */
    private val owner: Int get() = currentUser.id.toInt()

    private fun FoodRecord.applyFrom(food: Food) {
        userId = owner
        name = food.name
        kind = food.kind.name
        barcode = food.barcode
        caloriesPer_100g = food.nutrition.caloriesPer100g
        proteinPer_100g = food.nutrition.proteinPer100g
        carbsPer_100g = food.nutrition.carbsPer100g
        fatPer_100g = food.nutrition.fatPer100g
        cookedWeightG = food.cookedWeightG
    }

    fun delete(id: Long) {
        dsl.deleteFrom(FOOD)
            .where(FOOD.ID.eq(id.toInt()))
            .and(FOOD.USER_ID.eq(owner))
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
    )
}
