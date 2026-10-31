package com.tucker.domain

/** How far a day's intake went past its Calorie Budget — calories alone. */
enum class BudgetVerdict {
    WITHIN_BUDGET,
    SLIGHTLY_OVER,
    OVER_BUDGET,
    ;

    companion object {
        /** The Tolerance: the band above the Budget, as a fraction of it. */
        private const val TOLERANCE = 0.10

        fun of(intakeKcal: Double, budgetKcal: Double): BudgetVerdict = when {
            intakeKcal > budgetKcal * (1 + TOLERANCE) -> OVER_BUDGET
            intakeKcal > budgetKcal -> SLIGHTLY_OVER
            else -> WITHIN_BUDGET
        }
    }
}
