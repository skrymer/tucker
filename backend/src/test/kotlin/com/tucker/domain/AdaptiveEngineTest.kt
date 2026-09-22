package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.math.round
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
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
    fun `Maintenance adaptive averages intake over logged days and spreads weight loss over its span`() {
        // Logged 2000 kcal on each of 10 days (20000 total), but the trend fell 0.5 kg
        // across a 14-day span. Intake averages over the 10 logged days (2000), while
        // the weight loss spreads over all 14: 0.5 x 7700 / 14 = 275 kcal/day
        // shortfall -> maintenance 2275. The two divisors differ on purpose (ADR 0018).
        val adaptive = Maintenance.adaptive(
            totalIntakeKcal = 20000.0,
            loggedDays = 10,
            trendChange = WeightTrend.Change(kg = -0.5, overDays = 14),
            windowDays = 14,
            basalMetabolicRateKcal = 1730.0,
        )!!
        assertEquals(2275.0, adaptive.kcal, 0.01)
        assertEquals(Maintenance.Basis.ADAPTIVE, adaptive.basis)
    }

    @Test
    fun `the adaptive estimate is refused below the basal metabolic rate`() {
        // 10 days logged at 800 kcal against a trend that rose 0.5 kg over 13 days:
        // the divisor floors at the window, so the weight term is
        // -0.5 x 7700 / 14 = -275 and the balance comes out at 525 kcal. Positive, so
        // the `kcal > 0` invariant waves it through — and far under the 1139 kcal this
        // body burns at rest, which no amount of inactivity reaches. The window's log
        // and its scale are contradicting each other (ADR 0031).
        val refused = Maintenance.adaptive(
            totalIntakeKcal = 8000.0,
            loggedDays = 10,
            trendChange = WeightTrend.Change(kg = 0.5, overDays = 13),
            windowDays = 14,
            basalMetabolicRateKcal = 1139.0,
        )

        assertNull(refused)
    }

    @Test
    fun `a balance exactly at the basal rate is a measurement`() {
        // The line is "below the basal rate is not a measurement" (ADR 0031), so the
        // rate itself is still one — a body burning exactly its resting cost and no
        // more. The strictness is the whole rule, and nothing else drives its edge.
        val exactly = Maintenance.adaptive(
            totalIntakeKcal = 18100.0,
            loggedDays = 10,
            trendChange = WeightTrend.Change(kg = 0.0, overDays = 14),
            windowDays = 14,
            basalMetabolicRateKcal = 1810.0,
        )

        assertEquals(1810.0, exactly!!.kcal, 0.01)
    }

    @Test
    fun `a non-positive balance is refused even where the basal rate is itself absurd`() {
        // Nothing bounds Mifflin-St Jeor from below: a height entered in metres rather
        // than centimetres yields a negative basal rate, and a gate that only asks
        // "is the balance above it" then admits a negative Maintenance — the very
        // figure `require(kcal > 0)` refuses, which is issue #332's outage reopened.
        // A 0.0004 kg rise is -0.22 kcal/day of balance, which sits *above* a basal
        // rate of -0.375 and so passes a gate that asks only about the rate.
        val refused = Maintenance.adaptive(
            totalIntakeKcal = 0.0,
            loggedDays = 10,
            trendChange = WeightTrend.Change(kg = 0.0004, overDays = 14),
            windowDays = 14,
            basalMetabolicRateKcal = -0.375,
        )

        assertNull(refused)
    }

    @Test
    fun `a held Maintenance records which condition held it`() {
        val held = Maintenance.held(2400.0, Maintenance.HeldReason.BELOW_BASAL_RATE)

        assertEquals(Maintenance.Basis.HELD, held.basis)
        assertEquals(Maintenance.HeldReason.BELOW_BASAL_RATE, held.heldReason)
    }

    @Test
    fun `a Maintenance that was not held cannot carry a held reason`() {
        // The basis and the reason are one fact, so they are constructed as one thing
        // and cannot drift: `held` is the only way to acquire a reason, and a figure
        // the engine measured or seeded has nothing to explain (ADR 0031).
        assertFailsWith<IllegalArgumentException> {
            Maintenance(2400.0, Maintenance.Basis.ADAPTIVE, Maintenance.HeldReason.THIN_LOG)
        }
    }

    @Test
    fun `a Maintenance of zero calories is refused`() {
        // The Calorie Budget is Maintenance less the Goal's deficit, so a zero
        // here is a negative Budget — and `held` carries whatever it is given
        // forward week after week without re-deriving it.
        assertFailsWith<IllegalArgumentException> {
            Maintenance.held(0.0, Maintenance.HeldReason.BELOW_BASAL_RATE)
        }
    }

    @Test
    fun `the adaptive estimate refuses a window with no logged days`() {
        // Both figures are divisors. Zero would make the estimate an Infinity that
        // Maintenance's own kcal > 0 check waves through, so it is refused here.
        assertFailsWith<IllegalArgumentException> {
            Maintenance.adaptive(
                totalIntakeKcal = 20000.0,
                loggedDays = 0,
                trendChange = WeightTrend.Change(kg = -0.5, overDays = 14),
                windowDays = 14,
                basalMetabolicRateKcal = 1730.0,
            )
        }
    }

    @Test
    fun `the adaptive estimate refuses a window of no days`() {
        // The window is a divisor too — the floor under the change's own span — and a
        // correction over no days is not a daily rate. Refused here rather than left
        // to the span to rescue: with a span of its own the arithmetic sails through
        // and produces a figure for a window that never happened.
        assertFailsWith<IllegalArgumentException> {
            Maintenance.adaptive(
                totalIntakeKcal = 20000.0,
                loggedDays = 10,
                trendChange = WeightTrend.Change(kg = -0.5, overDays = 14),
                windowDays = 0,
                basalMetabolicRateKcal = 1730.0,
            )
        }
    }

    @Test
    fun `a change seen across more days than the window is spread over its own span`() {
        // The scale saw 0.2 kg move over 20 days, and the window it corrects is 14.
        // At the window's rate that reads 110 kcal/day; at the rate actually observed
        // it is 0.2 x 7700 / 20 = 77.
        val adaptive = Maintenance.adaptive(
            totalIntakeKcal = 20000.0,
            loggedDays = 10,
            trendChange = WeightTrend.Change(kg = -0.2, overDays = 20),
            windowDays = 14,
            basalMetabolicRateKcal = 1730.0,
        )!!

        assertEquals(2077.0, adaptive.kcal, 0.01)
    }

    @Test
    fun `a change seen across fewer days than the window is spread over the window`() {
        // 0.2 kg between two readings a day apart is one EWMA step off one noisy
        // reading. At its own rate that is 1540 kcal/day of imbalance claimed for a
        // fortnight; over the window it corrects it is 110. Evidence about a day is
        // not evidence about a fortnight.
        val adaptive = Maintenance.adaptive(
            totalIntakeKcal = 20000.0,
            loggedDays = 10,
            trendChange = WeightTrend.Change(kg = -0.2, overDays = 1),
            windowDays = 14,
            basalMetabolicRateKcal = 1730.0,
        )!!

        assertEquals(2110.0, adaptive.kcal, 0.01)
    }

    @Test
    fun `a trend change observed across no days corrects nothing`() {
        // Nothing weighed since the window opened, so both ends are the same point.
        // The floor is load-bearing here and not merely redundant: without it the
        // divisor is the change's own span of zero, and -0.0 / 0 is NaN, which
        // Maintenance's `kcal > 0` refuses.
        // Unreachable through the engine, which holds rather than adapting on a window
        // it has no weighing for — but specified here, because whether evidence is
        // enough is the engine's judgement and this is the formula's answer if asked.
        val adaptive = Maintenance.adaptive(
            totalIntakeKcal = 20000.0,
            loggedDays = 10,
            trendChange = WeightTrend.Change(kg = 0.0, overDays = 0),
            windowDays = 14,
            basalMetabolicRateKcal = 1730.0,
        )!!

        assertEquals(2000.0, adaptive.kcal, 0.01)
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
