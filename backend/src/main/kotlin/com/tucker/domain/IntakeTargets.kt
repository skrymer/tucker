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

    /**
     * Whether these targets applied no deficit at all — the Calorie Budget *is* the
     * Maintenance they were derived from. Ordinary in **Maintenance Mode**, where
     * there is no Goal to imply one (ADR 0008); against an active Goal it is a
     * **Suspended Deficit** (ADR 0030), a Goal's rate always implying a deficit.
     *
     * Read off what the review recorded rather than re-derived against the live
     * Goal: the review may predate a Goal change, and then the answer would
     * contradict the Budget it is printed beside.
     */
    val appliesNoDeficit: Boolean get() = calorieBudgetKcal == maintenance.kcal

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
         * Whether [goal]'s deficit still leaves a Calorie Budget to publish at
         * [maintenance]. Strict, because the `init` block above refuses a Budget
         * of exactly zero — which is why this lives beside that invariant rather
         * than on [Goal], where the two would agree only by comment.
         *
         * False is a **Suspended Deficit** (ADR 0030), and this is its one
         * spelling: the gate that refuses a new Goal asks it before any targets
         * exist, and the daily summary asks it of the targets a review recorded.
         */
        fun deficitApplies(maintenance: Maintenance, goal: Goal): Boolean =
            goal.dailyDeficitKcal() < maintenance.kcal

        /**
         * The deficit actually applied: the Goal's, or **none** where its rate
         * demands more than [maintenance] can supply. Tucker publishes no Budget it
         * did not derive, so the alternative to the Goal's deficit is zero and
         * never an invented floor.
         */
        private fun deficitToApply(maintenance: Maintenance, goal: Goal?): Double =
            goal?.takeIf { deficitApplies(maintenance, goal) }?.dailyDeficitKcal() ?: 0.0
    }
}
