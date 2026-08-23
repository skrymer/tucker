package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.math.round
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Pure-domain tests for the adaptive engine's arithmetic. */
class AdaptiveEngineTest {

    private fun day(d: Int) = LocalDate.of(2026, 5, d)

    @Test
    fun `WeightTrend smooths a noisy series`() {
        val trend = WeightTrend.from(
            listOf(
                WeightMeasurement(null, day(1), 80.0),
                WeightMeasurement(null, day(2), 82.0),
                WeightMeasurement(null, day(3), 80.0),
                WeightMeasurement(null, day(4), 81.0),
            ),
        )
        // EWMA (alpha 0.1): the first reading seeds the trend outright, and each
        // one after it moves the trend a tenth of the way towards itself. One
        // point per measurement, in measurement order.
        assertEquals(listOf(day(1), day(2), day(3), day(4)), trend.points.map { it.date })
        assertEquals(
            listOf(80.0, 80.2, 80.18, 80.262),
            trend.points.map { round(it.trendKg * 1e6) / 1e6 },
        )
        // The trend barely moves while the raw readings bounce by 2 kg.
        assertTrue(trend.latest()!!.trendKg < 81.0)
    }

    @Test
    fun `Maintenance seed is BMR times the activity factor`() {
        val profile = Profile(Sex.MALE, LocalDate.of(1986, 5, 22), 180.0)
        // BMR = 10*80 + 6.25*180 - 5*40 + 5 = 1730; x 1.4 = 2422
        val seed = Maintenance.seed(profile, 80.0, LocalDate.of(2026, 5, 22))
        assertEquals(2422.0, seed.kcal, 0.01)
        assertEquals(Maintenance.Basis.FORMULA_SEED, seed.basis)
    }

    @Test
    fun `Maintenance adaptive averages intake over logged days and spreads weight loss over the window`() {
        // Logged 2000 kcal on each of 10 days (20000 total), but the trend fell 0.5 kg
        // over the full 14-day window. Intake averages over the 10 logged days (2000),
        // while the weight loss spreads over 14 days: 0.5 x 7700 / 14 = 275 kcal/day
        // shortfall -> maintenance 2275. The two divisors differ on purpose (ADR 0018).
        val adaptive = Maintenance.adaptive(
            totalIntakeKcal = 20000.0,
            loggedDays = 10,
            trendWeightChangeKg = -0.5,
            windowDays = 14,
        )
        assertEquals(2275.0, adaptive.kcal, 0.01)
        assertEquals(Maintenance.Basis.ADAPTIVE, adaptive.basis)
    }

    @Test
    fun `a Maintenance of zero calories is refused`() {
        // The Calorie Budget is Maintenance less the Goal's deficit, so a zero
        // here is a negative Budget — and `held` carries whatever it is given
        // forward week after week without re-deriving it.
        assertFailsWith<IllegalArgumentException> { Maintenance.held(0.0) }
    }

    @Test
    fun `the adaptive estimate refuses a window with no logged days`() {
        // Both figures are divisors. Zero would make the estimate an Infinity that
        // Maintenance's own kcal > 0 check waves through, so it is refused here.
        assertFailsWith<IllegalArgumentException> {
            Maintenance.adaptive(
                totalIntakeKcal = 20000.0,
                loggedDays = 0,
                trendWeightChangeKg = -0.5,
                windowDays = 14,
            )
        }
    }

    @Test
    fun `the adaptive estimate refuses a window of no days`() {
        assertFailsWith<IllegalArgumentException> {
            Maintenance.adaptive(
                totalIntakeKcal = 20000.0,
                loggedDays = 10,
                trendWeightChangeKg = -0.5,
                windowDays = 0,
            )
        }
    }

    @Test
    fun `DailyLog rolls up calories and the estimated share`() {
        val log = DailyLog(
            day(1),
            listOf(
                EstimatedEntry(null, day(1), "Cafe lunch", 600.0, null),
                WeighedEntry(null, day(1), foodId = 1, grams = 100.0, calories = 400.0, protein = 20.0),
            ),
        )
        assertEquals(1000.0, log.caloriesConsumed(), 0.01)
        assertEquals(20.0, log.proteinConsumed(), 0.01)
        assertEquals(0.6, log.estimatedCalorieShare(), 0.01)
    }

    @Test
    fun `a day with nothing logged has no estimated share rather than a NaN one`() {
        // The share is a division by the day's own calories, so an empty day is
        // 0/0. It reaches the wire as `estimatedCalorieShare` on every daily
        // summary, and a NaN there serializes to something no client can read.
        assertEquals(0.0, DailyLog(day(1), emptyList()).estimatedCalorieShare(), 0.01)
    }

    @Test
    fun `DailyLog is on target under the budget with the protein floor met`() {
        val log = DailyLog(day(1), listOf(EstimatedEntry(null, day(1), "Lunch", 1500.0, 150.0)))
        assertEquals(
            DayStatus.ON_TARGET,
            log.dayStatus(calorieBudgetKcal = 2000.0, proteinFloorG = 140.0),
        )
    }

    @Test
    fun `DailyLog is over budget when intake exceeds the budget even with the floor met`() {
        val log = DailyLog(day(1), listOf(EstimatedEntry(null, day(1), "Lunch", 2200.0, 150.0)))
        assertEquals(
            DayStatus.OVER_BUDGET,
            log.dayStatus(calorieBudgetKcal = 2000.0, proteinFloorG = 140.0),
        )
    }

    @Test
    fun `DailyLog is over budget when intake exceeds the budget with the floor unmet`() {
        val log = DailyLog(day(1), listOf(EstimatedEntry(null, day(1), "Lunch", 2200.0, 90.0)))
        assertEquals(
            DayStatus.OVER_BUDGET,
            log.dayStatus(calorieBudgetKcal = 2000.0, proteinFloorG = 140.0),
        )
    }

    @Test
    fun `DailyLog is in progress under the budget with the protein floor unmet`() {
        val log = DailyLog(day(1), listOf(EstimatedEntry(null, day(1), "Lunch", 1500.0, 90.0)))
        assertEquals(
            DayStatus.IN_PROGRESS,
            log.dayStatus(calorieBudgetKcal = 2000.0, proteinFloorG = 140.0),
        )
    }

    @Test
    fun `DailyLog is on target at exactly the protein floor`() {
        // A Floor is a floor: reaching it is meeting it, not falling short of it.
        val log = DailyLog(day(1), listOf(EstimatedEntry(null, day(1), "Lunch", 1500.0, 140.0)))
        assertEquals(
            DayStatus.ON_TARGET,
            log.dayStatus(calorieBudgetKcal = 2000.0, proteinFloorG = 140.0),
        )
    }

    @Test
    fun `DailyLog is on target at exactly the calorie budget with the floor met`() {
        val log = DailyLog(day(1), listOf(EstimatedEntry(null, day(1), "Lunch", 2000.0, 150.0)))
        assertEquals(
            DayStatus.ON_TARGET,
            log.dayStatus(calorieBudgetKcal = 2000.0, proteinFloorG = 140.0),
        )
    }
}
