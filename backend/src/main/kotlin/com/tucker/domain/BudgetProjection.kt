package com.tucker.domain

/**
 * A Budget Projection (CONTEXT.md): the would-be over-budget state of a day if a
 * prospective [Entry] were also logged. Computed before the Entry is committed, so
 * the app can warn that logging it would push the day over the Calorie Budget — and
 * by how many calories. Calories only; the Protein Floor is a floor, not a ceiling.
 */
data class BudgetProjection(
    val wouldExceedBudget: Boolean,
    val projectedCaloriesConsumed: Double,
    val overByKcal: Double?,
)
