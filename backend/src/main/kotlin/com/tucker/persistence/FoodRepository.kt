package com.tucker.persistence

import com.tucker.domain.Food
import com.tucker.domain.FoodKind
import com.tucker.domain.Nutrition
import com.tucker.jooq.Tables.FOOD
import com.tucker.jooq.tables.records.FoodRecord
import org.jooq.DSLContext
import org.springframework.stereotype.Repository

/** Persistence for [Food] (plain foods and recipe foods alike). */
@Repository
class FoodRepository(private val dsl: DSLContext) {

    fun findById(id: Long): Food? =
        dsl.selectFrom(FOOD).where(FOOD.ID.eq(id.toInt())).fetchOne()?.toFood()

    fun findByBarcode(barcode: String): Food? =
        dsl.selectFrom(FOOD).where(FOOD.BARCODE.eq(barcode)).fetchOne()?.toFood()

    fun findAll(): List<Food> =
        dsl.selectFrom(FOOD).orderBy(FOOD.NAME.lower()).fetch().map { it.toFood() }

    /** Load every Food in [ids] in a single query (used to resolve recipe ingredients). */
    fun findByIds(ids: Collection<Long>): List<Food> {
        if (ids.isEmpty()) return emptyList()
        return dsl.selectFrom(FOOD)
            .where(FOOD.ID.`in`(ids.map { it.toInt() }))
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
        rec.id = id.toInt()
        rec.update()
        return food
    }

    /** Project a [Food]'s fields onto a [FoodRecord] (shared by insert and update). */
    private fun FoodRecord.applyFrom(food: Food) {
        name = food.name
        kind = food.kind.name
        barcode = food.barcode
        caloriesPer_100g = food.nutrition.caloriesPer100g.toFloat()
        proteinPer_100g = food.nutrition.proteinPer100g.toFloat()
        carbsPer_100g = food.nutrition.carbsPer100g?.toFloat()
        fatPer_100g = food.nutrition.fatPer100g?.toFloat()
        cookedWeightG = food.cookedWeightG?.toFloat()
    }

    fun delete(id: Long) {
        dsl.deleteFrom(FOOD).where(FOOD.ID.eq(id.toInt())).execute()
    }

    private fun FoodRecord.toFood(): Food = Food(
        id = id!!.toLong(),
        name = name,
        kind = FoodKind.valueOf(kind),
        barcode = barcode,
        nutrition = Nutrition(
            caloriesPer100g = caloriesPer_100g.toDouble(),
            proteinPer100g = proteinPer_100g.toDouble(),
            carbsPer100g = carbsPer_100g?.toDouble(),
            fatPer100g = fatPer_100g?.toDouble(),
        ),
        cookedWeightG = cookedWeightG?.toDouble(),
    )
}
