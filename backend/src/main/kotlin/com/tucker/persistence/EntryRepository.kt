package com.tucker.persistence

import com.tucker.domain.Entry
import com.tucker.domain.EntryKind
import com.tucker.domain.EstimatedEntry
import com.tucker.domain.WeighedEntry
import com.tucker.jooq.Tables.ENTRY
import com.tucker.jooq.tables.records.EntryRecord
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository
import java.time.LocalDate

/**
 * Persistence for [Entry] — both weighed and estimated.
 *
 * Every query is scoped to the current User (ADR 0021). The aggregates matter as
 * much as the lists: a day's calorie and protein totals, and the adaptive engine's
 * intake window, are all sums over rows this filter decides.
 */
@Repository
class EntryRepository(
    private val dsl: DSLContext,
    private val currentUser: CurrentUser,
) {

    fun findById(id: Long): Entry? =
        dsl.selectFrom(ENTRY)
            .where(ENTRY.ID.eq(id.toInt()))
            .and(ENTRY.USER_ID.eq(owner))
            .fetchOne()?.toEntry()

    fun findByDate(date: LocalDate): List<Entry> =
        dsl.selectFrom(ENTRY)
            .where(ENTRY.LOGGED_ON.eq(date.toString()))
            .and(ENTRY.USER_ID.eq(owner))
            .orderBy(ENTRY.ID)
            .fetch().map { it.toEntry() }

    /** Total calories across every Entry logged from [start] to [endInclusive], in one query. */
    fun totalCaloriesBetween(start: LocalDate, endInclusive: LocalDate): Double =
        dsl.select(DSL.sum(ENTRY.CALORIES))
            .from(ENTRY)
            .where(ENTRY.LOGGED_ON.between(start.toString(), endInclusive.toString()))
            .and(ENTRY.USER_ID.eq(owner))
            .fetchOne(0, Double::class.java) ?: 0.0

    /**
     * Number of distinct calendar days from [start] to [endInclusive] that carry at
     * least one Entry — the divisor the adaptive engine averages intake over, so an
     * unlogged day isn't counted as a zero-calorie day (ADR 0018).
     */
    fun loggedDayCount(start: LocalDate, endInclusive: LocalDate): Int =
        dsl.select(DSL.countDistinct(ENTRY.LOGGED_ON))
            .from(ENTRY)
            .where(ENTRY.LOGGED_ON.between(start.toString(), endInclusive.toString()))
            .and(ENTRY.USER_ID.eq(owner))
            .fetchOne(0, Int::class.java) ?: 0

    /** The current User's id, in the width the `user_id` column is generated as. */
    private val owner: Int get() = currentUser.id.toInt()

    fun insert(entry: Entry): Entry {
        val rec = dsl.newRecord(ENTRY)
        rec.userId = owner
        rec.loggedOn = entry.loggedOn.toString()
        rec.calories = entry.calories
        when (entry) {
            is WeighedEntry -> {
                rec.kind = EntryKind.WEIGHED.name
                rec.foodId = entry.foodId.toInt()
                rec.grams = entry.grams
                rec.protein = entry.protein
            }
            is EstimatedEntry -> {
                rec.kind = EntryKind.ESTIMATED.name
                rec.label = entry.label
                rec.protein = entry.protein
            }
        }
        rec.store()
        val id = rec.id!!.toLong()
        return when (entry) {
            is WeighedEntry -> entry.copy(id = id)
            is EstimatedEntry -> entry.copy(id = id)
        }
    }

    /**
     * Remove the caller's Entry [id], if it is theirs. The owner predicate is in the
     * `WHERE` rather than checked first: this is the only write with no scoped read in
     * front of it, so the statement itself has to be the guard. Deleting an Entry that
     * is not the caller's changes no rows, which is exactly what deleting one that
     * does not exist does.
     */
    fun delete(id: Long) {
        dsl.deleteFrom(ENTRY)
            .where(ENTRY.ID.eq(id.toInt()))
            .and(ENTRY.USER_ID.eq(owner))
            .execute()
    }

    /**
     * Whether any of the caller's Entries (necessarily a Weighed one) references the
     * Food [foodId] — the rule that refuses to delete a logged Food.
     *
     * Scoped like every other read, though nothing reachable depends on it: an Entry
     * can only reference a Food its own owner has, because the id resolved scoped
     * before the Entry was built, and V9 backfilled every pre-F10 row to one User.
     * The predicate is here so this query is safe on its own rather than only because
     * two others are correct — ADR 0021 rejected the shared catalog partly because
     * that delete rule leaked, and this is the query that used to leak it.
     */
    fun referencesFood(foodId: Long): Boolean =
        dsl.fetchExists(ENTRY, ENTRY.FOOD_ID.eq(foodId.toInt()).and(ENTRY.USER_ID.eq(owner)))

    private fun EntryRecord.toEntry(): Entry = when (EntryKind.valueOf(kind)) {
        EntryKind.WEIGHED -> WeighedEntry(
            id = id!!.toLong(),
            loggedOn = LocalDate.parse(loggedOn),
            foodId = foodId!!.toLong(),
            grams = grams!!,
            calories = calories,
            protein = protein!!,
        )
        EntryKind.ESTIMATED -> EstimatedEntry(
            id = id!!.toLong(),
            loggedOn = LocalDate.parse(loggedOn),
            label = label!!,
            calories = calories,
            protein = protein,
        )
    }
}
