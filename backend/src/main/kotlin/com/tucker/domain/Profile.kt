package com.tucker.domain

import java.time.LocalDate
import java.time.Period

/** Biological sex — an input to the Mifflin-St Jeor equation. */
enum class Sex { MALE, FEMALE }

/**
 * The user's body profile: the inputs to the Mifflin-St Jeor Maintenance seed.
 * A single-instance entity (Tucker is single-user).
 */
data class Profile(
    val sex: Sex,
    val birthDate: LocalDate,
    val heightCm: Double,
) {
    init {
        require(heightCm > 0) { "heightCm must be > 0, was $heightCm" }
    }

    /** Age in whole years on [on]. */
    fun ageOn(on: LocalDate): Int = Period.between(birthDate, on).years

    /**
     * Basal metabolic rate (kcal/day) by the Mifflin-St Jeor equation. This is
     * the formula seed for Maintenance, before adaptive correction takes over.
     */
    fun basalMetabolicRateKcal(weightKg: Double, on: LocalDate): Double {
        require(weightKg > 0) { "weightKg must be > 0" }
        val base = 10.0 * weightKg + 6.25 * heightCm - 5.0 * ageOn(on)
        return when (sex) {
            Sex.MALE -> base + 5.0
            Sex.FEMALE -> base - 161.0
        }
    }
}
