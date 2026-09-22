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

    private fun trendFalling(fromKg: Double, toKg: Double, overDays: Long) =
        trendFalling(fromKg, toKg, overDays, today)

    /** A steady fall of [kgPerDay], weighed every day for [days] ending today. */
    private fun fallingDaily(days: Int, fromKg: Double = 90.0, kgPerDay: Double = 0.1) =
        WeightTrend.from(
            (0..days).map { weighed(today.minusDays((days - it).toLong()), fromKg - kgPerDay * it) },
        )

    @Test
    fun `a change spans the two readings it was measured between`() {
        // Neither end is the day asked about: the anchor is the newest reading on or
        // before it, and the far end is the newest reading there is. Sixteen days lie
        // between them, which is neither the fourteen the caller named nor the twenty
        // back to today. Built through `from` rather than by hand, so the two kilos
        // it recovers are a real movement the smoothing shrank and not an arbitrary
        // pair of numbers.
        val trend = WeightTrend.from(
            listOf(
                weighed(today.minusDays(20), 88.0),
                weighed(today.minusDays(4), 86.0),
            ),
        )

        val change = trend.changeSince(today.minusDays(14))!!

        assertEquals(-2.0, change.kg, 1e-9)
        assertEquals(16, change.overDays)
    }

    @Test
    fun `a week of daily readings and one reading a week later leave the trend alike`() {
        // The smoothing measures elapsed days, not readings, so a gap decays like a
        // gap: a week covers the same distance toward a new level whether it held
        // seven readings or one. Weighing weekly no longer leaves the trend months
        // behind the body (ADR 0032).
        val start = today.minusDays(7)

        val daily = WeightTrend.from(
            listOf(weighed(start, 90.0)) + (1..7).map { weighed(start.plusDays(it.toLong()), 89.0) },
        )
        val weekly = WeightTrend.from(
            listOf(weighed(start, 90.0), weighed(start.plusDays(7), 89.0)),
        )

        assertEquals(daily.latest()!!.trendKg, weekly.latest()!!.trendKg, 1e-9)
    }

    @Test
    fun `two points at different depths measure the change between them`() {
        // A tenth of a kilo a day, weighed every day. The anchor is the fifth reading
        // and the far end the nineteenth, so the two carry different amounts of the
        // warm-up and their plain difference shows only two thirds of the fall. Exact
        // rather than approximate: the correction is algebraic on a steady series.
        val start = today.minusDays(18)

        val change = fallingDaily(days = 18).changeSince(start.plusDays(4))!!

        assertEquals(-1.4, change.kg, 1e-9)
        assertEquals(14, change.overDays)
    }

    @Test
    fun `the correction stops at double what the trend actually showed`() {
        // Weighed once, then nothing for six weeks, then two days running. The trend
        // has long since settled on the older reading, so the single day between the
        // last two shows barely a sixth of any real movement — and recovering the
        // other five sixths would be inventing them rather than reading them off the
        // scale (ADR 0032).
        val start = today.minusDays(41)
        val trend = WeightTrend.from(
            listOf(
                weighed(start, 90.0),
                weighed(start.plusDays(40), 88.0),
                weighed(start.plusDays(41), 87.5),
            ),
        )
        val shown = trend.points[2].trendKg - trend.points[1].trendKg

        val change = trend.changeSince(start.plusDays(40))!!

        assertEquals(2 * shown, change.kg, 1e-9)
        assertEquals(1, change.overDays)
    }

    @Test
    fun `a lone reading has observed no change, and so carries no rate`() {
        // The anchor and the far end are the same point. Zero across no days is the
        // only change it can hold, and zero is the rate that follows — the correction
        // it feeds contributes nothing rather than dividing by nothing.
        val trend = WeightTrend.from(listOf(weighed(today.minusDays(20), 88.0)))

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
        val trend = WeightTrend.from(
            listOf(
                weighed(today.minusDays(20), 88.0),
                weighed(today.minusDays(9), 87.0),
                weighed(today.minusDays(2), 86.5),
            ),
        )

        assertEquals(2, trend.weighedDaysSince(today.minusDays(14)))
    }

    @Test
    fun `a reading on the date itself is not weighed since it`() {
        // The boundary follows the anchor's own rule: a change measures *from* the
        // newest reading on or before that date, so counting it would let the anchor
        // stand as evidence about the window it merely opens.
        val trend = WeightTrend.from(listOf(weighed(today.minusDays(14), 88.0)))

        assertEquals(0, trend.weighedDaysSince(today.minusDays(14)))
    }

    @Test
    fun `two readings on one day are refused, not silently dropped`() {
        // The decay compounds over the days between readings, so a gap of none retains
        // the whole trend and the second reading moves it not at all. A User has one
        // reading a day by construction, so this is a caller bug and is named as one
        // rather than quietly discarding the newer figure.
        assertFailsWith<IllegalArgumentException> {
            WeightTrend.from(listOf(weighed(today, 86.0), weighed(today, 84.0)))
        }
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
        val trend = WeightTrend.from(
            listOf(
                weighed(today.minusDays(28), 88.0),
                weighed(today.minusDays(14), 87.0),
            ),
        )

        // 1.0 kg over the 28 days back to today = 0.25 kg/week. Measured to the last
        // reading it would span 14 days and read 0.5.
        assertEquals(0.25, trend.observedRateKgPerWeek(today)!!, 1e-9)
    }

    @Test
    fun `the observed rate is the real slope, not the shrunken one`() {
        // A tenth of a kilo a day for a month, weighed every day — 0.7 kg a week. The
        // two trend points 28 days apart carry different amounts of the warm-up, so
        // their plain slope reads about 0.51 and Drift Status and goal pace both hang
        // off it (ADR 0032).
        assertEquals(0.7, fallingDaily(days = 29).observedRateKgPerWeek(today)!!, 1e-9)
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
        val trend = WeightTrend.from(
            listOf(
                weighed(today.minusDays(200), 95.0),
                weighed(today.minusDays(28), 88.0),
                weighed(today, 86.0),
            ),
        )

        // 2 kg over the 28-day window is 0.5 kg/week. Anchored at the 200-day-old
        // point it would read 9 kg over 200 days — 0.315 kg/week. A looser tolerance
        // than the rest: the 200-day reading is off the line the other two sit on, so
        // the shrinkage divided back out is exact only to what survives 172 days of
        // decay — about a hundred-millionth.
        assertEquals(0.5, trend.observedRateKgPerWeek(today)!!, 1e-6)
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

        // 86.35, not the 86.0 that was weighed: ten days of smoothing carry the trend
        // most of the way to a new reading and never the whole way.
        assertEquals(87.0, trend.standingOn(today.minusDays(3))!!.trendKg, 1e-9)
        assertEquals(today.minusDays(10), trend.standingOn(today.minusDays(3))!!.date)
        assertEquals(86.3486784401, trend.standingOn(today)!!.trendKg, 1e-9)
    }

    @Test
    fun `the latest point is the newest reading, not the oldest`() {
        // What a Goal anchors its start weight on (ADR 0016), and what every read of
        // "where the trend stands now" resolves to — so the two ends of the series
        // have to be told apart. A trend that fell makes them different figures as
        // well as different days.
        val trend = trendFalling(fromKg = 87.0, toKg = 86.0, overDays = 10)

        assertEquals(86.3486784401, trend.latest()!!.trendKg, 1e-9)
        assertEquals(today, trend.latest()!!.date)
    }

    @Test
    fun `there is no latest point before anything is weighed`() {
        assertNull(WeightTrend.from(emptyList()).latest())
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
        fun readings(days: Int) = WeightTrend.from(
            (1..days).map { weighed(today.minusDays(days - it.toLong()), 86.0) },
        )

        assertFalse(readings(13).isEstablished())
        assertTrue(readings(14).isEstablished())
    }
}
