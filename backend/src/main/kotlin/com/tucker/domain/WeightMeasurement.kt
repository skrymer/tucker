package com.tucker.domain

import java.time.LocalDate

/**
 * A single dated reading of the user's body weight — the raw, noisy signal
 * behind goal progress and the adaptive Maintenance correction. Read by what
 * needs only the reading, stored or not; see [NewWeightMeasurement] and
 * [WeightMeasurement] (ADR 0036).
 */
sealed interface WeightMeasurementFields {
    val measuredOn: LocalDate
    val weightKg: Double
}

private fun WeightMeasurementFields.checkInvariants() {
    require(weightKg > 0) { "weightKg must be > 0, was $weightKg" }
}

/** A reading not yet stored. */
data class NewWeightMeasurement(
    override val measuredOn: LocalDate,
    override val weightKg: Double,
) : WeightMeasurementFields {
    init {
        checkInvariants()
    }

    companion object {
        fun recorded(measuredOn: LocalDate, weightKg: Double, today: LocalDate): NewWeightMeasurement {
            require(!measuredOn.isAfter(today)) {
                "measuredOn must not be in the future (was $measuredOn, today is $today)"
            }
            return NewWeightMeasurement(measuredOn = measuredOn, weightKg = weightKg)
        }
    }
}

/** A stored reading. */
data class WeightMeasurement(
    val id: Long,
    override val measuredOn: LocalDate,
    override val weightKg: Double,
) : WeightMeasurementFields {
    init {
        checkInvariants()
    }
}
