package com.tucker.domain

import java.time.LocalDate

/**
 * Where the user stands against an active [Goal], on two complementary readings,
 * both computed on the smoothed Trend Weight:
 *  - the **plan** — how far the trend has travelled from the start weight toward
 *    the target and, at the Goal's chosen rate, when it's projected to arrive;
 *  - the **observed pace** — how fast the trend is *actually* moving over the
 *    trailing window, its [PaceStatus] against the plan, and the finish date that
 *    pace projects. Withheld until enough measurement history exists.
 */
data class GoalProgress(
    val startWeightKg: Double,
    val targetWeightKg: Double,
    val currentTrendKg: Double,
    val kgToGo: Double,
    val percentComplete: Double,
    val plannedFinishDate: LocalDate,
    val plannedRateKgPerWeek: Double,
    val observedRateKgPerWeek: Double? = null,
    val paceStatus: PaceStatus? = null,
    val observedFinishDate: LocalDate? = null,
) {
    companion object {
        /** Percentages run 0–100. */
        private const val PERCENT = 100.0

        /** Tolerance band around the planned rate for on-pace classification (±20%). */
        private const val PACE_BAND = 0.20

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

        /**
         * Full progress for [goal] against the smoothed [trend] as of [today]:
         * the planned projection plus the *observed pace* — how fast the Trend
         * Weight is actually moving. The current trend is the latest trend point,
         * or the Goal's start weight before any measurement exists.
         */
        fun forGoal(goal: Goal, trend: WeightTrend, today: LocalDate): GoalProgress {
            val currentTrendKg = trend.latest()?.trendKg ?: goal.startWeightKg
            val base = planned(goal, currentTrendKg, today)
            val observedRate = trend.observedRateKgPerWeek(today) ?: return base
            return base.withPace(observedRate, goal.rateKgPerWeek, today)
        }

        /** Classify [observedRate] against the [plannedRate] and project a finish. */
        private fun GoalProgress.withPace(
            observedRate: Double,
            plannedRate: Double,
            today: LocalDate,
        ): GoalProgress {
            // A flat or rising trend has no loss to project a finish from.
            if (observedRate <= 0) {
                return copy(
                    observedRateKgPerWeek = observedRate,
                    paceStatus = PaceStatus.STALLED,
                )
            }
            val status = when {
                observedRate < plannedRate * (1 - PACE_BAND) -> PaceStatus.BEHIND
                observedRate > plannedRate * (1 + PACE_BAND) -> PaceStatus.AHEAD
                else -> PaceStatus.ON_PACE
            }
            val daysToFinish = Math.round(kgToGo / observedRate * Goal.DAYS_PER_WEEK)
            return copy(
                observedRateKgPerWeek = observedRate,
                paceStatus = status,
                observedFinishDate = today.plusDays(daysToFinish),
            )
        }
    }
}
