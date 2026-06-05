package com.tucker.service

import com.tucker.domain.Goal
import com.tucker.persistence.GoalRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

/** Application logic for Goals — chiefly, replacing the active Goal atomically. */
@Service
class GoalService(
    private val goals: GoalRepository,
    private val weeklyReview: WeeklyReviewService,
) {

    /**
     * Deactivate any current Goal and make [goal] the single active one, then
     * force-recompute today's [com.tucker.domain.WeeklyReview] so the new deficit
     * (and therefore the Calorie Budget and Protein Floor) takes effect immediately
     * rather than waiting up to a week for the next review cadence.
     *
     * A deliberate Goal change is one of the few moments the Budget is allowed to
     * move mid-week — clock-driven ticks still hold it steady. The recompute
     * *overwrites* any same-day review (see [WeeklyReviewService.recomputeFor]), and
     * on a fresh install it mints today's first one. Direct call rather than a
     * domain event: single consumer, and we want the save and review committed in
     * one transaction.
     */
    @Transactional
    fun replaceActiveGoal(goal: Goal, today: LocalDate = LocalDate.now()): Goal {
        goals.deactivateAll()
        val saved = goals.insert(goal)
        weeklyReview.recomputeFor(today)
        return saved
    }

    /**
     * Switch to Maintenance Mode: deactivate the active Goal (if any) and
     * force-recompute today's review so the Budget lifts to Maintenance immediately
     * (ADR 0008) rather than waiting up to a week. A no-op when no Goal is active.
     */
    @Transactional
    fun deactivateActiveGoal(today: LocalDate = LocalDate.now()) {
        if (goals.findActive() == null) return
        goals.deactivateAll()
        weeklyReview.recomputeFor(today)
    }
}
