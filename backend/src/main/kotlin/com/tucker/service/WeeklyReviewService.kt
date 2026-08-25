package com.tucker.service

import com.tucker.domain.Goal
import com.tucker.domain.IntakeTargets
import com.tucker.domain.Maintenance
import com.tucker.domain.Profile
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
     *
     * Returns [setupComplete], which it has to establish anyway — the daily summary
     * needs the same answer, and asking twice re-reads the Profile and a weight on
     * Tucker's hottest endpoint.
     */
    @Transactional
    fun catchUpIfDue(today: LocalDate): Boolean {
        if (!setupComplete()) return false
        // The same overdue predicate the Weekly-Review Reminder asks (ADR 0010) —
        // a missing review is itself overdue, so the very first one bootstraps here.
        if (ReviewCadence.isOverdue(reviews.latest()?.reviewedOn, today)) runReview(today)
        return true
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
     *
     * Orthogonal to Calorie Tracking, and surfaced on the daily summary because of
     * it: with tracking off a Calorie Budget is absent by choice, so absence alone
     * can no longer tell the client whether the User still has setup to finish.
     */
    fun setupComplete(): Boolean = profiles.get() != null && weights.latest() != null

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

        return reviews.insert(
            WeeklyReview(
                id = null,
                reviewedOn = on,
                trendWeightKg = trendWeightKg,
                // The review's second job, and the only optional one: with Calorie
                // Tracking off there is no intake to correct against, so a Budget
                // would be a target that can never become true (ADR 0024).
                intakeTargets = if (profile.tracksCalories) {
                    IntakeTargets.from(
                        estimateMaintenance(on, profile, trend, trendWeightKg),
                        goal,
                        trendWeightKg,
                    )
                } else {
                    null
                },
            ),
        )
    }

    /**
     * Adaptive with a trend anchor and at least [MIN_LOGGED_DAYS] of logging coverage;
     * below the floor it holds the prior review's Maintenance, or seeds at cold start
     * when there is none to hold (ADR 0018).
     */
    private fun estimateMaintenance(
        on: LocalDate,
        profile: Profile,
        trend: WeightTrend,
        currentTrendKg: Double,
    ): Maintenance {
        val windowStart = on.minusDays(ADAPTIVE_WINDOW_DAYS.toLong())
        val windowEnd = on.minusDays(1)
        val startTrendKg = trend.asOf(windowStart)
        val loggedDays = entries.loggedDayCount(windowStart, windowEnd)
        val totalIntake =
            if (loggedDays >= MIN_LOGGED_DAYS) entries.totalCaloriesBetween(windowStart, windowEnd) else 0.0

        // Adapt only with a trend anchor to measure the change against, enough logging
        // coverage that the average isn't set by one or two noisy days, and real
        // intake to average (days logged only as zero-calorie carry no signal).
        // Average over the days actually logged, not the whole window, so an unlogged
        // day doesn't read as a zero-calorie day and drag maintenance down; the
        // weight-change term keeps the full calendar span — the scale integrated the
        // real eating on the unlogged days regardless (ADR 0018).
        if (startTrendKg != null && loggedDays >= MIN_LOGGED_DAYS && totalIntake > 0.0) {
            return Maintenance.adaptive(
                totalIntakeKcal = totalIntake,
                loggedDays = loggedDays,
                trendWeightChangeKg = currentTrendKg - startTrendKg,
                windowDays = ADAPTIVE_WINDOW_DAYS,
            )
        }

        // Can't adapt — no trend anchor yet, too few logged days, or no real intake.
        // Hold the most recent earlier review's maintenance steady rather than
        // recompute from thin data: the Budget moves with the trend, not with logging
        // diligence (ADR 0018). The seed is the cold-start value, for when there is
        // nothing to hold.
        val heldKcal = heldMaintenanceKcal(on)
        return if (heldKcal != null) {
            Maintenance.held(heldKcal)
        } else {
            Maintenance.seed(profile, currentTrendKg, on)
        }
    }

    /**
     * The Maintenance to carry into the review for [on], or null to seed instead.
     *
     * Normally the preceding review's (ADR 0018). After a weight-only stretch that
     * review carries no targets and there is nothing to hold, so the seed re-anchors
     * on the body the User has now (ADR 0024) — but a *toggle* is not a stretch, so
     * an earlier figure is carried across a gap shorter than one cadence.
     *
     * The gap is measured from the preceding review, which is when tracking went
     * off — not from the held figure's own age. Otherwise a fortnight away, one app
     * open, and a setting flipped for a day would re-seed a User that ADR 0018 says
     * to hold: absence is its case, and holds however long it lasts.
     */
    private fun heldMaintenanceKcal(on: LocalDate): Double? {
        val previous = reviews.latestBefore(on) ?: return null
        return previous.intakeTargets?.maintenance?.kcal
            ?: reviews.latestWithTargetsBefore(on)
                ?.takeIf { !ReviewCadence.isOverdue(previous.reviewedOn, on) }
                ?.intakeTargets?.maintenance?.kcal
    }

    private companion object {
        /** The review window for the adaptive Maintenance correction. */
        const val ADAPTIVE_WINDOW_DAYS = 14

        /**
         * Minimum logged days in the window before the adaptive correction is trusted
         * (ADR 0018). Below it the prior maintenance is held, so a thin, noisy sample
         * can't set the Budget.
         */
        const val MIN_LOGGED_DAYS = 10
    }
}
