package com.tucker.persistence

import com.tucker.domain.Goal
import com.tucker.jooq.Tables.GOAL
import com.tucker.jooq.tables.records.GoalRecord
import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import java.time.LocalDate

/** Persistence for [Goal] — at most one is active at a time. */
@Repository
class GoalRepository(private val dsl: DSLContext) {

    fun findActive(): Goal? =
        dsl.selectFrom(GOAL).where(GOAL.ACTIVE.eq(1)).fetchOne()?.toGoal()

    /** Every Goal, newest first — the active one plus the inactive history. */
    fun findAll(): List<Goal> =
        dsl.selectFrom(GOAL)
            .orderBy(GOAL.STARTED_ON.desc(), GOAL.ID.desc())
            .fetch().map { it.toGoal() }

    fun insert(goal: Goal): Goal {
        val rec = dsl.newRecord(GOAL)
        rec.startedOn = goal.startedOn.toString()
        rec.startWeightKg = goal.startWeightKg.toFloat()
        rec.targetWeightKg = goal.targetWeightKg.toFloat()
        rec.rateKgPerWeek = goal.rateKgPerWeek.toFloat()
        rec.active = if (goal.active) 1 else 0
        rec.store()
        return goal.copy(id = rec.id!!.toLong())
    }

    /** Clear the active flag on every Goal — call before activating a new one. */
    fun deactivateAll() {
        dsl.update(GOAL).set(GOAL.ACTIVE, 0).where(GOAL.ACTIVE.eq(1)).execute()
    }

    private fun GoalRecord.toGoal(): Goal = Goal(
        id = id!!.toLong(),
        startedOn = LocalDate.parse(startedOn),
        startWeightKg = startWeightKg.toDouble(),
        targetWeightKg = targetWeightKg.toDouble(),
        rateKgPerWeek = rateKgPerWeek.toDouble(),
        active = active != 0,
    )
}
