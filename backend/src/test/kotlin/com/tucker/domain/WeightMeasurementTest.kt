package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.LocalDate
import kotlin.test.assertEquals

class WeightMeasurementTest {

    private val today = LocalDate.of(2026, 5, 29)

    @Test
    fun `recorded accepts a past measurement date`() {
        val yesterday = today.minusDays(1)
        val measurement = WeightMeasurement.recorded(measuredOn = yesterday, weightKg = 84.2, today = today)
        assertEquals(yesterday, measurement.measuredOn)
        assertEquals(84.2, measurement.weightKg)
    }

    @Test
    fun `recorded accepts today as the measurement date`() {
        val measurement = WeightMeasurement.recorded(measuredOn = today, weightKg = 84.2, today = today)
        assertEquals(today, measurement.measuredOn)
    }

    @Test
    fun `recorded rejects a future measurement date`() {
        val tomorrow = today.plusDays(1)
        val ex = assertThrows<IllegalArgumentException> {
            WeightMeasurement.recorded(measuredOn = tomorrow, weightKg = 84.2, today = today)
        }
        assert(ex.message!!.contains("future", ignoreCase = true)) {
            "expected message to mention future, was '${ex.message}'"
        }
    }

    @Test
    fun `recorded rejects a non-positive weight`() {
        val ex = assertThrows<IllegalArgumentException> {
            WeightMeasurement.recorded(measuredOn = today, weightKg = 0.0, today = today)
        }
        assert(ex.message!!.contains("weightKg", ignoreCase = true)) {
            "expected message to mention weightKg, was '${ex.message}'"
        }
    }
}
