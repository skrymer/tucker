package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNull

class WeightTrendTest {

    private val today = LocalDate.of(2026, 6, 3)

    /** A two-point trend whose slope over the trailing window is known exactly. */
    private fun trendFalling(fromKg: Double, toKg: Double, overDays: Long) =
        WeightTrend(
            listOf(
                WeightTrend.Point(today.minusDays(overDays), fromKg),
                WeightTrend.Point(today, toKg),
            ),
        )

    @Test
    fun `the observed rate is the trend slope over the trailing 28 days`() {
        // Trend fell 2 kg across the 28 days ending today: 2 kg / 4 weeks = 0.5 kg/week.
        val trend = trendFalling(fromKg = 88.0, toKg = 86.0, overDays = 28)

        assertEquals(0.5, trend.observedRateKgPerWeek(today)!!, 1e-9)
    }

    @Test
    fun `the observed rate is withheld until 14 days of measurements exist`() {
        // Only 10 days of trend history — too little to read a rate from.
        val trend = trendFalling(fromKg = 86.5, toKg = 86.0, overDays = 10)

        assertNull(trend.observedRateKgPerWeek(today))
    }
}
