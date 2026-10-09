package com.tucker.service

import com.tucker.domain.AdaptiveWindow
import com.tucker.domain.IntakeTargets
import com.tucker.domain.LoggedIntake
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
        val latestOn = reviews.latest()?.reviewedOn
        // A review a device a day ahead stamped (ADR 0014) does not stand here yet, so
        // the cadence is judged from the one that does, and none standing is overdue.
        val cadenceFrom = if (latestOn == today.plusDays(1)) {
            reviews.latestTwoOnOrBefore(today).firstOrNull()?.reviewedOn
        } else {
            latestOn
        }
        if (ReviewCadence.isOverdue(cadenceFrom, today)) runReview(today)
        return true
    }

    /**
     * The two reviews standing on [date], newest first: that day's targets and its
     * budget-change diff.
     */
    fun reviewsStandingOn(date: LocalDate): List<WeeklyReview> = reviews.latestTwoOnOrBefore(date)

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
     *
     * A review dated after [on] goes too: a device a day ahead stamped it from the
     * settings this change replaces, and it would stand once its day arrived.
     */
    @Transactional
    fun recomputeFor(on: LocalDate): WeeklyReview {
        reviews.deleteOnOrAfter(on)
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
                id = reviews.nextId(),
                reviewedOn = on,
                trendWeightKg = trendWeightKg,
                // The review's second job, and the only optional one: with Calorie
                // Tracking off there is no intake to correct against, so a Budget
                // would be a target that can never become true (ADR 0024). Asked
                // through the same method the Goal gate asks, so the figure a Goal
                // is measured against is the figure its review then records.
                intakeTargets = maintenanceFor(on, profile, trend, trendWeightKg)
                    ?.let { IntakeTargets.from(it, goal, trendWeightKg) },
            ),
        )
    }

    /**
     * The Maintenance a review for [on] would derive, independent of any Goal — so
     * a Goal's rate can be measured against it *before* that Goal exists
     * (ADR 0030). No circularity: the estimate never references a Goal (ADR 0008).
     *
     * Null wherever a review would derive none at all — setup incomplete, or
     * Calorie Tracking off, whose reviews carry no Intake Targets (ADR 0024) and
     * so have no Budget for a rate to outrun.
     */
    fun maintenanceFor(on: LocalDate): Maintenance? {
        val profile = profiles.get() ?: return null
        val trend = WeightTrend.from(weights.findAll())
        return trend.latest()?.let { maintenanceFor(on, profile, trend, it.trendKg) }
    }

    /** [maintenanceFor] against inputs a caller has already loaded. */
    private fun maintenanceFor(
        on: LocalDate,
        profile: Profile,
        trend: WeightTrend,
        trendWeightKg: Double,
    ): Maintenance? =
        if (profile.tracksCalories) estimateMaintenance(on, profile, trend, trendWeightKg) else null

    /**
     * Adaptive with a trend anchor and both coverage floors cleared — at least
     * [AdaptiveWindow.MIN_LOGGED_DAYS] of the window logged and
     * [AdaptiveWindow.MIN_WEIGHED_DAYS] of it weighed.
     * Below either it holds the prior review's Maintenance, or seeds at cold start
     * when there is none to hold (ADR 0018).
     */
    private fun estimateMaintenance(
        on: LocalDate,
        profile: Profile,
        trend: WeightTrend,
        currentTrendKg: Double,
    ): Maintenance {
        val window = adaptiveWindow(on, trend)
        // It may still refuse: a balance below the body's basal rate is the log and the
        // scale contradicting each other rather than a low expenditure (ADR 0031), and
        // whether the arithmetic produced a measurement is the domain's judgement to
        // make, not this method's. A refusal falls through to the hold below.
        val adapted = if (window.canAdapt) window.adapt(profile.basalMetabolicRateKcal(currentTrendKg, on)) else null

        // Hold the most recent earlier review's maintenance steady rather than
        // recompute from thin data: the Budget moves with the trend, not with logging
        // diligence (ADR 0018). The seed is the cold-start value, for when there is
        // nothing to hold, and carries no reason — a seed explains itself.
        return adapted
            ?: heldMaintenanceKcal(on)?.let { Maintenance.held(it, window.holdReason()) }
            ?: Maintenance.seed(profile, currentTrendKg, on)
    }

    /** The adaptive window that closes the day before [on]. */
    private fun adaptiveWindow(on: LocalDate, trend: WeightTrend): AdaptiveWindow {
        val windowStart = on.minusDays(AdaptiveWindow.ADAPTIVE_WINDOW_DAYS)
        // One read, so the days counted and the calories averaged are the same rows:
        // a day absent from the map is a day with no Entry, never a zero-calorie one.
        val intakeByDay = entries.caloriesByDay(windowStart, on.minusDays(1))
        return AdaptiveWindow(
            trendChange = trend.changeSince(windowStart),
            weighedDays = trend.weighedDaysSince(windowStart),
            intake = LoggedIntake(totalKcal = intakeByDay.values.sum(), loggedDays = intakeByDay.size),
        )
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
}
