package com.tucker.domain

/**
 * The intake half of a [WeeklyReview]: the Maintenance it was derived from, and
 * the Calorie Budget and Protein Floor in force for the week.
 *
 * Present or absent as one thing — a Floor with no Budget, or a Budget with no
 * Maintenance behind it, is not a state the domain has (ADR 0024).
 */
data class IntakeTargets(
    val maintenance: Maintenance,
    val calorieBudgetKcal: Double,
    val proteinFloorG: Double,
) {
    init {
        require(calorieBudgetKcal > 0) { "calorieBudgetKcal must be > 0" }
        require(proteinFloorG >= 0) { "proteinFloorG must be >= 0" }
    }

    companion object {
        /**
         * The week's targets: the Budget is [maintenance] less the deficit [goal]
         * implies — Maintenance itself in Maintenance Mode, where there is no Goal
         * to imply one (ADR 0008) — and the Floor comes off the trend, which is why
         * it applies in Maintenance Mode too.
         */
        fun from(maintenance: Maintenance, goal: Goal?, trendWeightKg: Double) = IntakeTargets(
            maintenance = maintenance,
            calorieBudgetKcal = maintenance.kcal - (goal?.dailyDeficitKcal() ?: 0.0),
            proteinFloorG = ProteinFloor.forTrendWeight(trendWeightKg),
        )
    }
}
