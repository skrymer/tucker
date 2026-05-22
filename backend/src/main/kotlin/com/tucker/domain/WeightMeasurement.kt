package com.tucker.domain

import java.time.LocalDate

/**
 * A single dated reading of the user's body weight — the raw, noisy signal
 * behind goal progress and the adaptive Maintenance correction.
 */
data class WeightMeasurement(
    val id: Long?,
    val measuredOn: LocalDate,
    val weightKg: Double,
) {
    init {
        require(weightKg > 0) { "weightKg must be > 0, was $weightKg" }
    }
}
