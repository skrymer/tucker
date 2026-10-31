package com.tucker.domain

import com.fasterxml.jackson.annotation.JsonValue

/** How far a day's intake went past its Calorie Budget — calories alone. */
enum class BudgetVerdict(@JsonValue val value: String) {
    WITHIN_BUDGET("within-budget"),
    SLIGHTLY_OVER("slightly-over"),
    OVER_BUDGET("over-budget"),
    ;

    companion object {
        /** The Tolerance: the band above the Budget, as a fraction of it. */
        private const val TOLERANCE = 0.10

        /** Past the Calorie Budget itself, slightly over included — where the Budget Projection warns. */
        fun isPastBudget(intakeKcal: Double, budgetKcal: Double): Boolean = intakeKcal > budgetKcal

        fun of(intakeKcal: Double, budgetKcal: Double): BudgetVerdict = when {
            intakeKcal > budgetKcal * (1 + TOLERANCE) -> OVER_BUDGET
            isPastBudget(intakeKcal, budgetKcal) -> SLIGHTLY_OVER
            else -> WITHIN_BUDGET
        }
    }
}
