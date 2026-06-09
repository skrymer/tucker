package com.tucker.service

import com.tucker.domain.Maintenance
import com.tucker.domain.Profile
import com.tucker.domain.ProteinFloor
import com.tucker.domain.ReviewCadence
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

    /**
     * Lazy catch-up: keep the weekly cadence advancing on every daily-summary read
     * without a scheduler. Bootstraps the very first review once setup is complete
     * (in Maintenance Mode no Goal creation has fired one), then runs a fresh review
     * snapped to [today] whenever the latest has aged past the weekly cadence. A
     * no-op while a recent review exists or setup is incomplete.
     */
    @Transactional
    fun catchUpIfDue(today: LocalDate) {
        if (!setupComplete()) return
        // The same overdue predicate the Weekly-Review Reminder asks (ADR 0010) —
        // a missing review is itself overdue, so the very first one bootstraps here.
        if (ReviewCadence.isOverdue(reviews.latest()?.reviewedOn, today)) runReview(today)
    }

    /**
     * The two most recent reviews, newest first — the inputs to the dashboard's
     * budget-change diff. The summary reads reviews through the engine rather than
     * the repository directly.
     */
    fun recentReviews(): List<WeeklyReview> = reviews.latestTwo()

    /**
     * The inputs a review needs; absent any of them, catch-up stays a no-op. A Goal
     * is *not* required — its absence is Maintenance Mode (ADR 0008), which still
     * reviews — only a Profile (for the formula seed) and at least one weight.
     */
    private fun setupComplete(): Boolean =
        profiles.get() != null &&
            WeightTrend.from(weights.findAll()).latest() != null

    /**
     * Force-recompute the review for [on], overwriting any existing same-day record.
     *
     * [runReview] is deliberately idempotent — the Budget is "held steady in between"
     * clock-driven ticks — so a deliberate Goal change recomputes through here, dropping
     * the stale same-day record first so the fresh deficit takes effect immediately.
     */
    @Transactional
    fun recomputeFor(on: LocalDate): WeeklyReview {
        reviews.deleteByReviewedOn(on)
        return runReview(on)
    }

    /** Run the weekly review for [on] and persist the resulting [WeeklyReview]. */
    @Transactional
    fun runReview(on: LocalDate): WeeklyReview {
        // Idempotent: a review is recomputed weekly and held steady in between, so a
        // repeat run on a day that already has one returns it rather than minting a
        // duplicate (the lazy catch-up may already have created today's on app open).
        // Look up by date — not only against latest() — so it is robust to out-of-order
        // reviews and never collides with the reviewed_on UNIQUE constraint.
        reviews.findByReviewedOn(on)?.let { return it }

        // No active Goal is Maintenance Mode (ADR 0008): the Budget is Maintenance
        // with no deficit, and the Protein Floor is derived straight from the trend.
        val goal = goals.findActive()
        val profile = profiles.get()
            ?: error("no Profile — cannot run a weekly review")

        val trend = WeightTrend.from(weights.findAll())
        val trendWeightKg = trend.latest()?.trendKg
            ?: error("no weight measurements — cannot run a weekly review")

        val maintenance = estimateMaintenance(on, profile, trend, trendWeightKg)
        val calorieBudget = maintenance.kcal - (goal?.dailyDeficitKcal() ?: 0.0)
        val proteinFloor = ProteinFloor.forTrendWeight(trendWeightKg)

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
    }
}
