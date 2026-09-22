package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals

class DriftStatusTest {

    private val today = LocalDate.of(2026, 6, 3)

    /**
     * A 28-day trend ending at 86 kg whose observed rate is exactly [ratePerWeek]
     * (loss-positive: a positive rate falls, a negative rate rises).
     *
     * Weighed rather than hand-placed, because the rate divides the smoothing's own
     * shrinkage back out (ADR 0032) and can only divide it out of something it
     * actually shrank — so these are the readings, and the fall between them is the
     * rate. Two hand-placed points 28 days apart would read 5.5% fast.
     */
    private fun trendAtRate(ratePerWeek: Double) =
        WeightTrend.from(
            listOf(
                weighed(today.minusDays(28), 86.0 + ratePerWeek * 4),
                weighed(today, 86.0),
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
    fun `the band edge itself, either direction, still holds`() {
        // The rate goes in directly: the band is ±0.1 kg/week, and no trend built
        // from whole kilograms lands a division on exactly that. The edge belongs
        // to holding — drift starts past the band, not at it.
        assertEquals(DriftStatus.HOLDING, DriftStatus.forRate(0.1))
        assertEquals(DriftStatus.HOLDING, DriftStatus.forRate(-0.1))
    }

    @Test
    fun `drift reads as gathering data until 14 days of measurements exist`() {
        // Only 10 days of trend history — too little to read drift from yet.
        val trend = WeightTrend.from(
            listOf(
                weighed(today.minusDays(10), 86.5),
                weighed(today, 86.0),
            ),
        )

        assertEquals(DriftStatus.GATHERING_DATA, DriftStatus.forTrend(trend, today))
    }
}
