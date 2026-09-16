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
            calorieBudgetKcal = maintenance.kcal - deficitToApply(maintenance, goal),
            proteinFloorG = ProteinFloor.forTrendWeight(trendWeightKg),
        )

        /**
         * The deficit actually applied: the Goal's, or **none** where its rate
         * demands more than [maintenance] can supply — a Suspended Deficit
         * (ADR 0030). Tucker publishes no Budget it did not derive, so the
         * alternative to the Goal's deficit is zero and never an invented floor.
         */
        private fun deficitToApply(maintenance: Maintenance, goal: Goal?): Double =
            goal?.takeIf { it.deficitFitsWithin(maintenance.kcal) }?.dailyDeficitKcal() ?: 0.0
    }
}
