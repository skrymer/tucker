package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

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
    fun `a change spans the two readings it was measured between`() {
        // Neither end is the day asked about: the anchor is the newest reading on or
        // before it, and the far end is the newest reading there is. Sixteen days lie
        // between them, which is neither the fourteen the caller named nor the twenty
        // back to today.
        val trend = WeightTrend(
            listOf(
                WeightTrend.Point(today.minusDays(20), 88.0),
                WeightTrend.Point(today.minusDays(4), 86.0),
            ),
        )

        val change = trend.changeSince(today.minusDays(14))!!

        assertEquals(-2.0, change.kg, 1e-9)
        assertEquals(16, change.overDays)
    }

    @Test
    fun `a lone reading has observed no change, and so carries no rate`() {
        // The anchor and the far end are the same point. Zero across no days is the
        // only change it can hold, and zero is the rate that follows — the correction
        // it feeds contributes nothing rather than dividing by nothing.
        val trend = WeightTrend(listOf(WeightTrend.Point(today.minusDays(20), 88.0)))

        val change = trend.changeSince(today.minusDays(14))!!

        assertEquals(0.0, change.kg, 1e-9)
        assertEquals(0, change.overDays)
    }

    @Test
    fun `there is no change to measure before the trend begins`() {
        val trend = trendFalling(fromKg = 87.0, toKg = 86.0, overDays = 10)

        assertNull(trend.changeSince(today.minusDays(14)))
    }

    @Test
    fun `the days weighed since a date exclude the anchor that precedes it`() {
        // Three readings, one of them the anchor the change is measured from. The
        // anchor is evidence about the days *before* the date asked about, so it is
        // not one of them — two days were weighed since, not three.
        val trend = WeightTrend(
            listOf(
                WeightTrend.Point(today.minusDays(20), 88.0),
                WeightTrend.Point(today.minusDays(9), 87.0),
                WeightTrend.Point(today.minusDays(2), 86.5),
            ),
        )

        assertEquals(2, trend.weighedDaysSince(today.minusDays(14)))
    }

    @Test
    fun `a reading on the date itself is not weighed since it`() {
        // The boundary follows the anchor's own rule: a change measures *from* the
        // newest reading on or before that date, so counting it would let the anchor
        // stand as evidence about the window it merely opens.
        val trend = WeightTrend(listOf(WeightTrend.Point(today.minusDays(14), 88.0)))

        assertEquals(0, trend.weighedDaysSince(today.minusDays(14)))
    }

    @Test
    fun `a change across a negative span is refused`() {
        assertFailsWith<IllegalArgumentException> {
            WeightTrend.Change(kg = -0.5, overDays = -1)
        }
    }

    @Test
    fun `a movement across no days is refused`() {
        // Neither this nor the negative span is reachable through `changeSince`, whose
        // two ends come off one list in order. They are the type's own invariants, so
        // that a second producer cannot pair a movement with a span it never spanned.
        assertFailsWith<IllegalArgumentException> {
            WeightTrend.Change(kg = -0.5, overDays = 0)
        }
    }

    @Test
    fun `the observed rate is measured to today, not to the last reading`() {
        // The deliberate asymmetry with `changeSince` (ADR 0018): Drift Status and goal
        // pace read as "where the trend stands now", so days since the last weigh-in
        // count against the rate. Every other trend fixture here weighs on `today`,
        // where the two divisors coincide and a switch to `changeSince` would be silent.
        val trend = WeightTrend(
            listOf(
                WeightTrend.Point(today.minusDays(28), 88.0),
                WeightTrend.Point(today.minusDays(14), 87.0),
            ),
        )

        // 1.0 kg over the 28 days back to today = 0.25 kg/week. Measured to the last
        // reading it would span 14 days and read 0.5.
        assertEquals(0.25, trend.observedRateKgPerWeek(today)!!, 1e-9)
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

    @Test
    fun `the trend stands where the last reading left it until the next one`() {
        // It moves only when the scale does, so the days between two weigh-ins carry
        // the figure the earlier one produced rather than a gap.
        val trend = trendFalling(fromKg = 87.0, toKg = 86.0, overDays = 10)

        assertEquals(87.0, trend.standingOn(today.minusDays(3))!!.trendKg, 1e-9)
        assertEquals(today.minusDays(10), trend.standingOn(today.minusDays(3))!!.date)
        assertEquals(86.0, trend.standingOn(today)!!.trendKg, 1e-9)
    }

    @Test
    fun `nothing stands before the first reading`() {
        val trend = trendFalling(fromKg = 87.0, toKg = 86.0, overDays = 10)

        assertNull(trend.standingOn(today.minusDays(11)))
    }

    @Test
    fun `a trend is established once fourteen days carry a reading`() {
        // The threshold the observed rate is withheld under, counted in readings here:
        // a line needs points, where a rate needs a span to divide across.
        fun readings(days: Int) = WeightTrend(
            (1..days).map { WeightTrend.Point(today.minusDays(days - it.toLong()), 86.0) },
        )

        assertFalse(readings(13).isEstablished())
        assertTrue(readings(14).isEstablished())
    }
}
