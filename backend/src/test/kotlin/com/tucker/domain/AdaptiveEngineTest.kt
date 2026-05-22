package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals
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
        // EWMA (alpha 0.1): 80 -> 80.2 -> 80.18 -> 80.262
        assertEquals(80.262, trend.latest()!!.trendKg, 1e-6)
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
    fun `Maintenance adaptive adds the energy of weight lost`() {
        // Ate 2000 kcal/day, trend fell 0.5 kg over 14 days.
        // 0.5 kg x 7700 / 14 = 275 kcal/day shortfall -> maintenance 2275.
        val adaptive = Maintenance.adaptive(
            averageDailyIntakeKcal = 2000.0,
            trendWeightChangeKg = -0.5,
            days = 14,
        )
        assertEquals(2275.0, adaptive.kcal, 0.01)
        assertEquals(Maintenance.Basis.ADAPTIVE, adaptive.basis)
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
}
