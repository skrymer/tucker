package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/**
 * The rules of a Weight Timeline (CONTEXT.md, ADR 0029). Selecting the readings is
 * the repository's job; these are the rules that turn a User's whole reading
 * history into the window they are shown.
 */
class WeightTimelineTest {

    private val to = LocalDate.of(2026, 9, 6)
    private val from = to.minusDays(27)

    /** Daily readings ending on [to], newest last — [kg] is read in that order. */
    private fun daily(vararg kg: Double, endingOn: LocalDate = to) =
        kg.mapIndexed { index, weight ->
            WeightMeasurement(
                id = null,
                measuredOn = endingOn.minusDays((kg.size - 1 - index).toLong()),
                weightKg = weight,
            )
        }

    @Test
    fun `a day carries the reading taken on it and the trend through it`() {
        // Twenty-seven steady days and one spike: the trend moves a tenth of the way
        // toward the new reading, so 0.1 x 90 + 0.9 x 80 is a hand-checkable 81.
        val steadyThenSpike = daily(*DoubleArray(27) { 80.0 }, 90.0)

        val timeline = WeightTimeline.of(from, to, steadyThenSpike)!!

        assertEquals(28, timeline.days.size)
        assertEquals(from, timeline.days.first().date)
        assertEquals(to, timeline.days.last().date)
        // One entry per day with none missing: the client draws a day at its
        // position in the run, so a gap would compress the time axis silently.
        assertEquals((0L..27L).map { from.plusDays(it) }, timeline.days.map { it.date })
        assertEquals(90.0, timeline.days.last().weightKg)
        assertEquals(81.0, timeline.days.last().trendKg, 1e-9)
    }

    @Test
    fun `a day nobody weighed in on holds the trend it already had, and no reading`() {
        // The trend moves only when the scale does, so a skipped day is not a gap in
        // the line — it is the same figure, standing still until the next reading.
        val stoppedTwoDaysAgo = daily(*DoubleArray(28) { 80.0 }).dropLast(2)

        val timeline = WeightTimeline.of(from, to, stoppedTwoDaysAgo)!!

        val lastTwo = timeline.days.takeLast(2)
        assertEquals(listOf(null, null), lastTwo.map { it.weightKg })
        assertEquals(listOf(80.0, 80.0), lastTwo.map { it.trendKg })
    }

    @Test
    fun `a window reaching back before the first reading starts where the readings do`() {
        // Padding it out would draw eight empty days, which claims weight data is
        // missing rather than that the User had not started weighing in yet.
        val twentyDays = daily(*DoubleArray(20) { 80.0 })

        val timeline = WeightTimeline.of(from, to, twentyDays)!!

        assertEquals(to.minusDays(19), timeline.from)
        assertEquals(to.minusDays(19), timeline.days.first().date)
        assertEquals(20, timeline.days.size)
    }

    @Test
    fun `the trend carries what the readings before the window did to it`() {
        // A month at 90 kg, then the window opens on the first reading at 80. The
        // trend moves a tenth of the way and opens at 89 — where a trend restarted
        // at the window's edge would open at 80, and every figure after it would be
        // a different number from the one the engine publishes.
        val lostTenKg = daily(*(DoubleArray(32) { 90.0 } + DoubleArray(28) { 80.0 }))

        val timeline = WeightTimeline.of(from, to, lostTenKg)!!

        assertEquals(from, timeline.days.first().date)
        assertEquals(89.0, timeline.days.first().trendKg, 1e-9)
    }

    @Test
    fun `a window of any width but 28 or 90 days is refused`() {
        // The width is an invariant of this read rather than a caller's choice, as
        // MicronutrientIntake and FrequentFoods each refuse their own: 28 is the
        // span Pace Status is already classified over, and 90 is the only other one
        // offered.
        val ninetyDays = daily(*DoubleArray(90) { 80.0 })

        listOf(7L, 29L, 91L).forEach { days ->
            assertFailsWith<IllegalArgumentException> {
                WeightTimeline.of(to.minusDays(days - 1), to, ninetyDays)
            }
        }
    }

    @Test
    fun `ninety days is a window too, and carries a day for each of them`() {
        val ninetyDays = daily(*DoubleArray(90) { 80.0 })

        val timeline = WeightTimeline.of(to.minusDays(89), to, ninetyDays)!!

        assertEquals(90, timeline.days.size)
    }

    @Test
    fun `a timeline is withheld under fourteen days of readings`() {
        // The threshold behind the observed pace, Pace Status and Drift Status, and
        // the same reason: a trend built from a handful of readings understates its
        // own movement, so drawing it invites reading a slope that is not there.
        val thirteenDays = daily(*DoubleArray(13) { 80.0 })

        assertNull(WeightTimeline.of(from, to, thirteenDays))
    }

    @Test
    fun `a fourteenth day of readings is enough for a timeline`() {
        val fourteenDays = daily(*DoubleArray(14) { 80.0 })

        val timeline = WeightTimeline.of(from, to, fourteenDays)!!

        assertEquals(14, timeline.days.size)
    }

    @Test
    fun `a window that ends before the readings begin has nothing to draw`() {
        // A device whose clock ran fast stamps readings in the future, and the
        // window then closes before the first of them. Cutting the start forward
        // would leave a timeline starting after it ends, which is a shape nothing
        // downstream can read.
        val nextMonth = daily(*DoubleArray(20) { 80.0 }, endingOn = to.plusMonths(1))

        assertNull(WeightTimeline.of(from, to, nextMonth))
    }
}
