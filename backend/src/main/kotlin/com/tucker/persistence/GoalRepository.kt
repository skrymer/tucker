package com.tucker.persistence

import com.tucker.domain.Goal
import com.tucker.jooq.Tables.GOAL
import com.tucker.jooq.tables.records.GoalRecord
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import java.time.LocalDate

/**
 * Persistence for [Goal] — at most one is active at a time, **per User**
 * (ADR 0021). Scoped implicitly, so no method here takes an owner.
 *
 * "At most one active" is a rule about a person: held across everybody, one
 * User starting a Goal deactivates another's and drops them into Maintenance
 * Mode having decided nothing.
 */
@Repository
class GoalRepository(
    private val dsl: DSLContext,
    private val currentUser: CurrentUser,
) {

    fun findActive(): Goal? =
        dsl.selectFrom(GOAL)
            .where(GOAL.ACTIVE.eq(1))
            .and(GOAL.USER_ID.eq(currentUser.ownerId))
            .fetchOne()?.toGoal()

    /** Every Goal, newest first — the active one plus the inactive history. */
    fun findAll(): List<Goal> =
        dsl.selectFrom(GOAL)
            .where(GOAL.USER_ID.eq(currentUser.ownerId))
            .orderBy(GOAL.STARTED_ON.desc(), GOAL.ID.desc())
            .fetch().map { it.toGoal() }

    fun insert(goal: Goal): Goal {
        val rec = dsl.newRecord(GOAL)
        rec.userId = currentUser.ownerId
        rec.startedOn = goal.startedOn.toString()
        rec.startWeightKg = goal.startWeightKg
        rec.targetWeightKg = goal.targetWeightKg
        rec.rateKgPerWeek = goal.rateKgPerWeek
        rec.active = if (goal.active) 1 else 0
        rec.reachedOn = goal.reachedOn?.toString()
        rec.store()
        return goal.copy(id = rec.id!!.toLong())
    }

    /** Clear the active flag on the caller's Goals — call before activating a new one. */
    fun deactivateAll() {
        dsl.update(GOAL)
            .set(GOAL.ACTIVE, 0)
            .where(GOAL.ACTIVE.eq(1))
            .and(GOAL.USER_ID.eq(currentUser.ownerId))
            .execute()
    }

    /**
     * Stamp the date a Goal was reached (ADR 0008).
     *
     * The owner predicate is belt-and-braces rather than a reachable guard: the
     * only caller stamps the id [findActive] just handed it, which is already the
     * caller's own. It is here so that the *next* caller of this method inherits
     * the scoping instead of having to remember it.
     */
    fun updateReachedOn(id: Long, reachedOn: LocalDate) {
        dsl.update(GOAL)
            .set(GOAL.REACHED_ON, reachedOn.toString())
            .where(GOAL.ID.eq(id.toInt()))
            .and(GOAL.USER_ID.eq(currentUser.ownerId))
            .execute()
    }

    private fun GoalRecord.toGoal(): Goal = Goal(
        id = id!!.toLong(),
        startedOn = LocalDate.parse(startedOn),
        startWeightKg = startWeightKg,
        targetWeightKg = targetWeightKg,
        rateKgPerWeek = rateKgPerWeek,
        active = active != 0,
        reachedOn = reachedOn?.let(LocalDate::parse),
    )
}
