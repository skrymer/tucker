package com.tucker.persistence

import com.tucker.domain.Entry
import com.tucker.domain.EntryKind
import com.tucker.domain.EstimatedEntry
import com.tucker.domain.WeighedEntry
import com.tucker.jooq.Tables.ENTRY
import com.tucker.jooq.tables.records.EntryRecord
import org.jooq.DSLContext
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository
import java.time.LocalDate

/** Persistence for [Entry] — both weighed and estimated. */
@Repository
class EntryRepository(private val dsl: DSLContext) {

    fun findById(id: Long): Entry? =
        dsl.selectFrom(ENTRY).where(ENTRY.ID.eq(id.toInt())).fetchOne()?.toEntry()

    fun findByDate(date: LocalDate): List<Entry> =
        dsl.selectFrom(ENTRY)
            .where(ENTRY.LOGGED_ON.eq(date.toString()))
            .orderBy(ENTRY.ID)
            .fetch().map { it.toEntry() }

    /** Total calories across every Entry logged from [start] to [endInclusive], in one query. */
    fun totalCaloriesBetween(start: LocalDate, endInclusive: LocalDate): Double {
        val sum = dsl.select(DSL.sum(ENTRY.CALORIES))
            .from(ENTRY)
            .where(ENTRY.LOGGED_ON.between(start.toString(), endInclusive.toString()))
            .fetchOne()
            ?.value1()
        return sum?.toDouble() ?: 0.0
    }

    fun insert(entry: Entry): Entry {
        val rec = dsl.newRecord(ENTRY)
        rec.loggedOn = entry.loggedOn.toString()
        rec.calories = entry.calories.toFloat()
        when (entry) {
            is WeighedEntry -> {
                rec.kind = EntryKind.WEIGHED.name
                rec.foodId = entry.foodId.toInt()
                rec.grams = entry.grams.toFloat()
                rec.protein = entry.protein.toFloat()
            }
            is EstimatedEntry -> {
                rec.kind = EntryKind.ESTIMATED.name
                rec.label = entry.label
                rec.protein = entry.protein?.toFloat()
            }
        }
        rec.store()
        val id = rec.id!!.toLong()
        return when (entry) {
            is WeighedEntry -> entry.copy(id = id)
            is EstimatedEntry -> entry.copy(id = id)
        }
    }

    fun delete(id: Long) {
        dsl.deleteFrom(ENTRY).where(ENTRY.ID.eq(id.toInt())).execute()
    }

    /** Whether any Entry (necessarily a Weighed one) references the Food [foodId]. */
    fun referencesFood(foodId: Long): Boolean =
        dsl.fetchExists(ENTRY, ENTRY.FOOD_ID.eq(foodId.toInt()))

    private fun EntryRecord.toEntry(): Entry = when (EntryKind.valueOf(kind)) {
        EntryKind.WEIGHED -> WeighedEntry(
            id = id!!.toLong(),
            loggedOn = LocalDate.parse(loggedOn),
            foodId = foodId!!.toLong(),
            grams = grams!!.toDouble(),
            calories = calories.toDouble(),
            protein = protein!!.toDouble(),
        )
        EntryKind.ESTIMATED -> EstimatedEntry(
            id = id!!.toLong(),
            loggedOn = LocalDate.parse(loggedOn),
            label = label!!,
            calories = calories.toDouble(),
            protein = protein?.toDouble(),
        )
    }
}
