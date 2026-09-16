package com.tucker.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

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
    val reachedOn: LocalDate? = null,
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

    /**
     * Where the plan puts the Trend Weight on [date] — from [startWeightKg] at
     * [rateKgPerWeek], and flat at [targetWeightKg] once it gets there, the plan
     * being to reach the target and nothing below it. Null on a day before the
     * Goal was set, the plan not existing yet.
     *
     * Never rises: the init block above refuses a rate at or below zero and a
     * target at or above the start weight.
     */
    fun plannedWeightOn(date: LocalDate): Double? {
        if (date.isBefore(startedOn)) return null
        val weeks = ChronoUnit.DAYS.between(startedOn, date) / DAYS_PER_WEEK
        return maxOf(startWeightKg - rateKgPerWeek * weeks, targetWeightKg)
    }

    /**
     * Stamp [reachedOn] iff the Goal just crossed its target — i.e. it isn't
     * already reached and [trendWeightKg] meets the target. Reaching *latches*
     * (ADR 0008): an already-reached Goal is returned unchanged, never restamped
     * nor unset, so the surfaced signal doesn't flicker as the trend wobbles.
     */
    fun markReachedIfCrossed(trendWeightKg: Double, on: LocalDate): Goal =
        if (reachedOn == null && isReachedAt(trendWeightKg)) copy(reachedOn = on) else this

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
