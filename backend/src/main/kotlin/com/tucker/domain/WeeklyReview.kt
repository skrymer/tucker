package com.tucker.domain

import java.time.LocalDate

/**
 * One weekly recomputation of the adaptive engine: the Maintenance, Calorie
 * Budget and Protein Floor in force for the week beginning [reviewedOn].
 * A historical record — once written, a WeeklyReview is not changed.
 */
data class WeeklyReview(
    val id: Long?,
    val reviewedOn: LocalDate,
    val trendWeightKg: Double,
    val maintenanceKcal: Double,
    val calorieBudgetKcal: Double,
    val proteinFloorG: Double,
    val note: String?,
) {
    init {
        require(trendWeightKg > 0) { "trendWeightKg must be > 0" }
        require(maintenanceKcal > 0) { "maintenanceKcal must be > 0" }
        require(calorieBudgetKcal > 0) { "calorieBudgetKcal must be > 0" }
        require(proteinFloorG >= 0) { "proteinFloorG must be >= 0" }
    }
}
