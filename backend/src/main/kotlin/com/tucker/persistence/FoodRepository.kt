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
        rec.name = food.name
        rec.kind = food.kind.name
        rec.barcode = food.barcode
        rec.caloriesPer_100g = food.nutrition.caloriesPer100g.toFloat()
        rec.proteinPer_100g = food.nutrition.proteinPer100g.toFloat()
        rec.carbsPer_100g = food.nutrition.carbsPer100g?.toFloat()
        rec.fatPer_100g = food.nutrition.fatPer100g?.toFloat()
        rec.cookedWeightG = food.cookedWeightG?.toFloat()
        rec.store()
        return food.copy(id = rec.id!!.toLong())
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
