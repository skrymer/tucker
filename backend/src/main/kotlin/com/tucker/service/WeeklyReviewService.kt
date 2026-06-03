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
import java.time.temporal.ChronoUnit

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

    /**
     * Lazy catch-up: if the latest review has aged past the weekly cadence, run
     * one fresh review snapped to [today]. A no-op when a recent review already
     * exists, when no cadence has started yet, or when setup is incomplete — so
     * it is safe to call on every daily-summary read without a scheduler.
     */
    @Transactional
    fun catchUpIfDue(today: LocalDate) {
        val latest = reviews.latest() ?: return
        val due = ChronoUnit.DAYS.between(latest.reviewedOn, today) >= REVIEW_CADENCE_DAYS
        if (due && setupComplete()) {
            runReview(today)
        }
    }

    /** The inputs a review needs; absent any of them, catch-up stays a no-op. */
    private fun setupComplete(): Boolean =
        goals.findActive() != null &&
            profiles.get() != null &&
            WeightTrend.from(weights.findAll()).latest() != null

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
        val totalIntake = entries.totalCaloriesBetween(windowStart, on.minusDays(1))

        // Adapt only once the window holds enough history: both a trend anchor to
        // measure the change against and some logged intake to correct against.
        // Absent either (a fresh start, or a gap in logging), fall back to the
        // formula seed rather than derive maintenance from a phantom zero-calorie
        // diet — which would be non-positive and meaningless.
        return if (startTrendKg != null && totalIntake > 0.0) {
            Maintenance.adaptive(
                averageDailyIntakeKcal = totalIntake / ADAPTIVE_WINDOW_DAYS,
                trendWeightChangeKg = currentTrendKg - startTrendKg,
                days = ADAPTIVE_WINDOW_DAYS,
            )
        } else {
            Maintenance.seed(profile, currentTrendKg, on)
        }
    }

    private companion object {
        /** The review window for the adaptive Maintenance correction. */
        const val ADAPTIVE_WINDOW_DAYS = 14

        /** A review is due once the latest one is this many days old. */
        const val REVIEW_CADENCE_DAYS = 7L
    }
}
