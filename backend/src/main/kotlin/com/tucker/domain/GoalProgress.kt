package com.tucker.domain

import java.time.LocalDate

/**
 * Where the user stands against an active [Goal]: how far the smoothed Trend
 * Weight has travelled from the start weight toward the target, and — at the
 * Goal's chosen rate — when the target is projected to be reached.
 *
 * Pure projection from the plan; the *observed* pace (whether the trend is
 * actually moving fast enough) is a later concern and not modelled here yet.
 */
data class GoalProgress(
    val startWeightKg: Double,
    val targetWeightKg: Double,
    val currentTrendKg: Double,
    val kgToGo: Double,
    val percentComplete: Double,
    val plannedFinishDate: LocalDate,
    val plannedRateKgPerWeek: Double,
) {
    companion object {
        /** Percentages run 0–100. */
        private const val PERCENT = 100.0

        /** Project progress for [goal] given the live [currentTrendKg] and [today]. */
        fun planned(goal: Goal, currentTrendKg: Double, today: LocalDate): GoalProgress {
            val kgToGo = (currentTrendKg - goal.targetWeightKg).coerceAtLeast(0.0)
            val totalToLose = goal.startWeightKg - goal.targetWeightKg
            val lost = goal.startWeightKg - currentTrendKg
            val percentComplete = (lost / totalToLose * PERCENT).coerceIn(0.0, PERCENT)
            val daysToFinish = Math.round(kgToGo / goal.rateKgPerWeek * Goal.DAYS_PER_WEEK)
            return GoalProgress(
                startWeightKg = goal.startWeightKg,
                targetWeightKg = goal.targetWeightKg,
                currentTrendKg = currentTrendKg,
                kgToGo = kgToGo,
                percentComplete = percentComplete,
                plannedFinishDate = today.plusDays(daysToFinish),
                plannedRateKgPerWeek = goal.rateKgPerWeek,
            )
        }
    }
}
