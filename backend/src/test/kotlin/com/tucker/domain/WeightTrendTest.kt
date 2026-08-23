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
    fun `asOf reads the trend as it stood then, ignoring everything measured since`() {
        // What a past Weekly Review saw. Later points must not leak backwards into
        // it — a review is a historical record, so the figure it read has to stay
        // the figure it read.
        val trend = WeightTrend(
            listOf(
                WeightTrend.Point(today.minusDays(20), 88.0),
                WeightTrend.Point(today.minusDays(10), 87.0),
                WeightTrend.Point(today, 86.0),
            ),
        )

        assertEquals(87.0, trend.asOf(today.minusDays(5))!!, 1e-9)
    }

    @Test
    fun `the observed rate is the trend slope over the trailing 28 days`() {
        // Trend fell 2 kg across the 28 days ending today: 2 kg / 4 weeks = 0.5 kg/week.
        val trend = trendFalling(fromKg = 88.0, toKg = 86.0, overDays = 28)

        assertEquals(0.5, trend.observedRateKgPerWeek(today)!!, 1e-9)
    }

    @Test
    fun `the rate anchors 28 days back, not at the oldest measurement on file`() {
        // A year of history must not flatten this month's rate. The anchor is the
        // newest point at or before the window edge; everything older is context.
        val trend = WeightTrend(
            listOf(
                WeightTrend.Point(today.minusDays(200), 95.0),
                WeightTrend.Point(today.minusDays(28), 88.0),
                WeightTrend.Point(today, 86.0),
            ),
        )

        // 2 kg over the 28-day window is 0.5 kg/week. Anchored at the 200-day-old
        // point it would read 9 kg over 200 days — 0.315 kg/week.
        assertEquals(0.5, trend.observedRateKgPerWeek(today)!!, 1e-9)
    }

    @Test
    fun `the fourteenth day is enough history — the rate is published, not withheld`() {
        // The floor is "at least 14 days", so the day it is reached is the first
        // day a rate exists. A day either side of this reads the same otherwise.
        val trend = trendFalling(fromKg = 87.0, toKg = 86.0, overDays = 14)

        assertEquals(0.5, trend.observedRateKgPerWeek(today)!!, 1e-9)
    }

    @Test
    fun `the observed rate is withheld until 14 days of measurements exist`() {
        // Only 10 days of trend history — too little to read a rate from.
        val trend = trendFalling(fromKg = 86.5, toKg = 86.0, overDays = 10)

        assertNull(trend.observedRateKgPerWeek(today))
    }
}
