package com.tucker.service

import com.tucker.domain.Maintenance
import com.tucker.domain.Profile
import com.tucker.domain.WeeklyReview
import com.tucker.domain.WeightTrend
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

/**
 * The adaptive engine. Once a week it recomputes Maintenance from the smoothed
 * weight trend and logged intake, then derives the Calorie Budget and Protein
 * Floor for the coming week and records a [WeeklyReview].
 *
 * A thin orchestrator: the arithmetic lives in the domain ([WeightTrend],
 * [Maintenance], Goal, Profile) — this service only loads, composes and persists.
 */
@Service
class WeeklyReviewService(
    private val weights: WeightMeasurementRepository,
    private val entries: EntryRepository,
    private val profiles: ProfileRepository,
    private val goals: GoalRepository,
    private val reviews: WeeklyReviewRepository,
) {

    /** Run the weekly review for [on] and persist the resulting [WeeklyReview]. */
    @Transactional
    fun runReview(on: LocalDate): WeeklyReview {
        check(reviews.latest()?.reviewedOn != on) { "a weekly review has already run for $on" }

        val goal = goals.findActive()
            ?: error("no active Goal — cannot run a weekly review")
        val profile = profiles.get()
            ?: error("no Profile — cannot run a weekly review")

        val trend = WeightTrend.from(weights.findAll())
        val trendWeightKg = trend.latest()?.trendKg
            ?: error("no weight measurements — cannot run a weekly review")

        val maintenance = estimateMaintenance(on, profile, trend, trendWeightKg)
        val calorieBudget = maintenance.kcal - goal.dailyDeficitKcal()
        val proteinFloor = goal.proteinFloorGrams(trendWeightKg)

        return reviews.insert(
            WeeklyReview(
                id = null,
                reviewedOn = on,
                trendWeightKg = trendWeightKg,
                maintenanceKcal = maintenance.kcal,
                calorieBudgetKcal = calorieBudget,
                proteinFloorG = proteinFloor,
                note = "Maintenance basis: ${maintenance.basis}",
            ),
        )
    }

    /** Adaptive once a full window of trend data exists; the formula seed before then. */
    private fun estimateMaintenance(
        on: LocalDate,
        profile: Profile,
        trend: WeightTrend,
        currentTrendKg: Double,
    ): Maintenance {
        val windowStart = on.minusDays(ADAPTIVE_WINDOW_DAYS.toLong())
        val startTrendKg = trend.asOf(windowStart)
            ?: return Maintenance.seed(profile, currentTrendKg, on)

        val totalIntake = entries.totalCaloriesBetween(windowStart, on.minusDays(1))
        return Maintenance.adaptive(
            averageDailyIntakeKcal = totalIntake / ADAPTIVE_WINDOW_DAYS,
            trendWeightChangeKg = currentTrendKg - startTrendKg,
            days = ADAPTIVE_WINDOW_DAYS,
        )
    }

    private companion object {
        /** The review window for the adaptive Maintenance correction. */
        const val ADAPTIVE_WINDOW_DAYS = 14
    }
}
