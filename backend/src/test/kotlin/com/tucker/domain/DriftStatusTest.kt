package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals

class DriftStatusTest {

    private val today = LocalDate.of(2026, 6, 3)

    /**
     * A 28-day trend ending at 86 kg whose observed rate is exactly [ratePerWeek]
     * (loss-positive: a positive rate falls, a negative rate rises).
     */
    private fun trendAtRate(ratePerWeek: Double) =
        WeightTrend(
            listOf(
                WeightTrend.Point(today.minusDays(28), 86.0 + ratePerWeek * 4),
                WeightTrend.Point(today, 86.0),
            ),
        )

    @Test
    fun `a flat trend reads as holding`() {
        assertEquals(DriftStatus.HOLDING, DriftStatus.forTrend(trendAtRate(0.0), today))
    }

    @Test
    fun `a trend falling faster than the band reads as drifting down`() {
        // Losing 0.11 kg/week — just past the +0.1 band edge.
        assertEquals(
            DriftStatus.DRIFTING_DOWN,
            DriftStatus.forTrend(trendAtRate(0.11), today),
        )
    }

    @Test
    fun `a trend rising faster than the band reads as drifting up`() {
        // Gaining 0.11 kg/week — just past the -0.1 band edge.
        assertEquals(
            DriftStatus.DRIFTING_UP,
            DriftStatus.forTrend(trendAtRate(-0.11), today),
        )
    }

    @Test
    fun `drift just inside the band, either direction, still holds`() {
        // 0.09 kg/week of movement is within the ±0.1 band — holding, not drifting.
        assertEquals(DriftStatus.HOLDING, DriftStatus.forTrend(trendAtRate(0.09), today))
        assertEquals(DriftStatus.HOLDING, DriftStatus.forTrend(trendAtRate(-0.09), today))
    }

    @Test
    fun `drift reads as gathering data until 14 days of measurements exist`() {
        // Only 10 days of trend history — too little to read drift from yet.
        val trend = WeightTrend(
            listOf(
                WeightTrend.Point(today.minusDays(10), 86.5),
                WeightTrend.Point(today, 86.0),
            ),
        )

        assertEquals(DriftStatus.GATHERING_DATA, DriftStatus.forTrend(trend, today))
    }
}
