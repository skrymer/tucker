package com.tucker.service

import com.tucker.domain.Goal
import com.tucker.domain.WeightTrend
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

/** Application logic for Goals — chiefly, replacing the active Goal atomically. */
@Service
class GoalService(
    private val goals: GoalRepository,
    private val weights: WeightMeasurementRepository,
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
        requireBelowCurrentTrend(goal)
        goals.deactivateAll()
        val saved = goals.insert(goal)
        weeklyReview.recomputeFor(today)
        return saved
    }

    /**
     * Guard a loss Goal against an already-reached target: its target must be below
     * the current Trend Weight (ADR 0008). Reaching is checked on the live trend, so
     * a target at or above it would stamp `reachedOn` on the very next measurement —
     * it isn't a loss campaign at all. When no measurements exist there is no trend
     * yet; the Goal's own start-weight invariant carries the check until one does.
     */
    private fun requireBelowCurrentTrend(goal: Goal) {
        val currentTrendKg = WeightTrend.from(weights.findAll()).latest()?.trendKg ?: return
        require(!goal.isReachedAt(currentTrendKg)) {
            "a weight-loss Goal needs a target below your current trend weight " +
                "(${"%.1f".format(currentTrendKg)} kg)"
        }
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
