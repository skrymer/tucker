package com.tucker.domain

import java.time.LocalDate

/**
 * A weight-loss Goal: a target weight, pursued at a chosen rate of loss.
 * The Goal derives the daily energy deficit. The Protein Floor is decoupled from
 * the Goal (ADR 0008) and lives in [ProteinFloor], since it applies in
 * Maintenance Mode too.
 */
data class Goal(
    val id: Long?,
    val startedOn: LocalDate,
    val startWeightKg: Double,
    val targetWeightKg: Double,
    val rateKgPerWeek: Double,
    val active: Boolean,
) {
    init {
        require(startWeightKg > 0) { "startWeightKg must be > 0" }
        require(targetWeightKg > 0) { "targetWeightKg must be > 0" }
        require(rateKgPerWeek in MIN_RATE_KG_PER_WEEK..MAX_RATE_KG_PER_WEEK) {
            "rateKgPerWeek must be between $MIN_RATE_KG_PER_WEEK and $MAX_RATE_KG_PER_WEEK kg/week"
        }
        require(targetWeightKg < startWeightKg) {
            "a weight-loss Goal needs a target below the start weight"
        }
    }

    /** The daily calorie deficit implied by the rate (1 kg of body fat ≈ 7700 kcal). */
    fun dailyDeficitKcal(): Double = rateKgPerWeek * KCAL_PER_KG_FAT / DAYS_PER_WEEK

    /** Whether [trendWeightKg] has reached (or passed) the target. */
    fun isReachedAt(trendWeightKg: Double): Boolean = trendWeightKg <= targetWeightKg

    companion object {
        /** Energy density of body fat — the basis for rate → deficit. */
        const val KCAL_PER_KG_FAT = 7700.0

        /** Days the weekly rate of loss is spread across. */
        const val DAYS_PER_WEEK = 7.0

        /** Slowest safe rate of loss — below this the Goal is effectively maintenance. */
        const val MIN_RATE_KG_PER_WEEK = 0.05

        /** Fastest safe rate of loss — beyond this risks muscle loss. */
        const val MAX_RATE_KG_PER_WEEK = 1.5
    }
}
