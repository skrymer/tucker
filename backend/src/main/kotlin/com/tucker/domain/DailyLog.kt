package com.tucker.domain

import java.time.LocalDate

/**
 * A single day's logged Entries, with the day's consumption rolled up.
 * "Calories consumed" for a day is the sum across that day's Entries.
 */
data class DailyLog(
    val date: LocalDate,
    val entries: List<Entry>,
) {
    /** Total calories consumed on this day. */
    fun caloriesConsumed(): Double = entries.sumOf { it.calories }

    /** Total protein consumed; estimated Entries without a protein figure count as 0. */
    fun proteinConsumed(): Double = entries.sumOf { it.protein ?: 0.0 }

    /** Fraction of the day's calories that came from estimated Entries (0.0–1.0). */
    fun estimatedCalorieShare(): Double {
        val total = caloriesConsumed()
        if (total <= 0.0) return 0.0
        return entries.filter { it.isEstimate }.sumOf { it.calories } / total
    }

    /**
     * The day's earned [DayStatus] against [calorieBudgetKcal] and [proteinFloorG].
     * Over budget wins unconditionally — it is real the moment it happens; a met
     * Protein Floor under budget is on-target; anything else is still in progress.
     */
    fun dayStatus(calorieBudgetKcal: Double, proteinFloorG: Double): DayStatus = when {
        caloriesConsumed() > calorieBudgetKcal -> DayStatus.OVER_BUDGET
        proteinConsumed() >= proteinFloorG -> DayStatus.ON_TARGET
        else -> DayStatus.IN_PROGRESS
    }

    /**
     * A [BudgetProjection]: the would-be state of this day if [prospective] were also
     * logged. The over-budget verdict reuses [dayStatus] against the day's existing
     * Entries plus the prospective one, so the forecast and the realized verdict can
     * never disagree. With no budget yet ([calorieBudgetKcal] null, before the first
     * WeeklyReview) there is nothing to exceed — the projection reports the running
     * total only.
     */
    fun project(
        prospective: Entry,
        calorieBudgetKcal: Double?,
        proteinFloorG: Double?,
    ): BudgetProjection {
        val projected = DailyLog(date, entries + prospective)
        val projectedConsumed = projected.caloriesConsumed()
        if (calorieBudgetKcal == null || proteinFloorG == null) {
            return BudgetProjection(false, projectedConsumed, overByKcal = null)
        }
        val wouldExceed = projected.dayStatus(calorieBudgetKcal, proteinFloorG) == DayStatus.OVER_BUDGET
        return BudgetProjection(
            wouldExceedBudget = wouldExceed,
            projectedCaloriesConsumed = projectedConsumed,
            overByKcal = if (wouldExceed) projectedConsumed - calorieBudgetKcal else null,
        )
    }
}
