package com.tucker.persistence

import com.tucker.domain.Entry
import com.tucker.domain.EntryKind
import com.tucker.domain.EstimatedEntry
import com.tucker.domain.FoodLogCount
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
            .and(ENTRY.USER_ID.eq(currentUser.ownerId))
            .fetchOne()?.toEntry()

    fun findByDate(date: LocalDate): List<Entry> =
        dsl.selectFrom(ENTRY)
            .where(ENTRY.LOGGED_ON.eq(date.toString()))
            .and(ENTRY.USER_ID.eq(currentUser.ownerId))
            .orderBy(ENTRY.ID)
            .fetch().map { it.toEntry() }

    /**
     * Every Entry logged from [start] to [endInclusive], oldest first — the rows an
     * Intake Breakdown rolls up. Both bounds are inclusive.
     */
    fun findBetween(start: LocalDate, endInclusive: LocalDate): List<Entry> =
        dsl.selectFrom(ENTRY)
            .where(ENTRY.LOGGED_ON.between(start.toString(), endInclusive.toString()))
            .and(ENTRY.USER_ID.eq(currentUser.ownerId))
            .orderBy(ENTRY.LOGGED_ON, ENTRY.ID)
            .fetch().map { it.toEntry() }

    /**
     * How often each Food was logged from [start] to [endInclusive], and when it
     * was last reached for — the counts a **Frequent Foods** ranking is decided on.
     *
     * An **Estimated Entry** names no Food, so it is excluded here in SQL rather
     * than dropped afterwards: the grouping happens first, so every estimate in
     * the window would arrive as one group keyed on null with nowhere to go.
     */
    fun logCountsBetween(start: LocalDate, endInclusive: LocalDate): List<FoodLogCount> =
        dsl.select(ENTRY.FOOD_ID, DSL.count(), DSL.max(ENTRY.LOGGED_ON))
            .from(ENTRY)
            .where(ENTRY.LOGGED_ON.between(start.toString(), endInclusive.toString()))
            .and(ENTRY.USER_ID.eq(currentUser.ownerId))
            .and(ENTRY.FOOD_ID.isNotNull)
            .groupBy(ENTRY.FOOD_ID)
            .fetch { (foodId, count, lastLoggedOn) ->
                FoodLogCount(
                    foodId = foodId!!.toLong(),
                    entryCount = count,
                    lastLoggedOn = LocalDate.parse(lastLoggedOn),
                )
            }

    /**
     * Calories logged per day from [start] to [endInclusive], in one query.
     *
     * A day with no Entry is **absent from the map** rather than present as a zero —
     * the distinction the adaptive engine averages over (ADR 0018) and the Weight
     * Timeline draws (ADR 0029). So the map's size is the window's logged-day count
     * and its values are the window's intake; neither is a query of its own.
     */
    fun caloriesByDay(start: LocalDate, endInclusive: LocalDate): Map<LocalDate, Double> =
        dsl.select(ENTRY.LOGGED_ON, DSL.sum(ENTRY.CALORIES))
            .from(ENTRY)
            .where(ENTRY.LOGGED_ON.between(start.toString(), endInclusive.toString()))
            .and(ENTRY.USER_ID.eq(currentUser.ownerId))
            .groupBy(ENTRY.LOGGED_ON)
            .fetch { (loggedOn, calories) -> LocalDate.parse(loggedOn) to calories!!.toDouble() }
            .toMap()

    fun insert(entry: Entry): Entry {
        val rec = dsl.newRecord(ENTRY)
        rec.userId = currentUser.ownerId
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
            .and(ENTRY.USER_ID.eq(currentUser.ownerId))
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
        dsl.fetchExists(ENTRY, ENTRY.FOOD_ID.eq(foodId.toInt()).and(ENTRY.USER_ID.eq(currentUser.ownerId)))

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
