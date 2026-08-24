package com.tucker.domain

import java.time.LocalDate
import java.time.Period
import java.time.ZoneId

/** Biological sex — an input to the Mifflin-St Jeor equation. */
enum class Sex { MALE, FEMALE }

/**
 * One User's personal settings: the body inputs to the Mifflin-St Jeor Maintenance
 * seed, their locale — [timezone] is the IANA zone that defines their local day —
 * their Weekly-Review Reminder preferences, and whether they are doing Calorie
 * Tracking. One per User (ADR 0021).
 */
data class Profile(
    val sex: Sex,
    val birthDate: LocalDate,
    val heightCm: Double,
    val timezone: String = DEFAULT_TIMEZONE,
    val reminderHour: Int = DEFAULT_REMINDER_HOUR,
    val remindersEnabled: Boolean = false,
    val tracksCalories: Boolean = DEFAULT_TRACKS_CALORIES,
) {
    init {
        require(heightCm > 0) { "heightCm must be > 0, was $heightCm" }
        require(reminderHour in 0..LAST_HOUR_OF_DAY) {
            "reminderHour must be in 0..$LAST_HOUR_OF_DAY, was $reminderHour"
        }
        require(timezone in ZoneId.getAvailableZoneIds()) {
            "timezone must be a known IANA zone, was '$timezone'"
        }
    }

    /** Age in whole years on [on]. */
    fun ageOn(on: LocalDate): Int = Period.between(birthDate, on).years

    /**
     * Basal metabolic rate (kcal/day) by the Mifflin-St Jeor equation. This is
     * the formula seed for Maintenance, before adaptive correction takes over.
     */
    fun basalMetabolicRateKcal(weightKg: Double, on: LocalDate): Double {
        require(weightKg > 0) { "weightKg must be > 0" }
        val base = WEIGHT_COEFFICIENT * weightKg + HEIGHT_COEFFICIENT * heightCm - AGE_COEFFICIENT * ageOn(on)
        return when (sex) {
            Sex.MALE -> base + MALE_OFFSET
            Sex.FEMALE -> base - FEMALE_OFFSET
        }
    }

    companion object {
        /** Sensible defaults until the user captures their own locale/prefs. */
        const val DEFAULT_TIMEZONE = "UTC"
        const val DEFAULT_REMINDER_HOUR = 9
        const val DEFAULT_TRACKS_CALORIES = true
        private const val LAST_HOUR_OF_DAY = 23

        // Mifflin-St Jeor equation coefficients.
        const val WEIGHT_COEFFICIENT = 10.0
        const val HEIGHT_COEFFICIENT = 6.25
        const val AGE_COEFFICIENT = 5.0
        const val MALE_OFFSET = 5.0
        const val FEMALE_OFFSET = 161.0
    }
}
