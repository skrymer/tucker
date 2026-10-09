package com.tucker.service

import com.tucker.domain.DailyLog
import com.tucker.domain.DriftStatus
import com.tucker.domain.WeeklyReview
import com.tucker.domain.WeightTrend
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.ReminderStateRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.springframework.stereotype.Service
import java.time.LocalDate

/** One day as the dashboard shows it: intake against the targets standing on it. */
data class DailySummary(
    val setupComplete: Boolean,
    val log: DailyLog,
    /** The reviews standing on the day, newest first: the one in force and the one before it. */
    val recent: List<WeeklyReview>,
    val hasActiveGoal: Boolean,
    /** The Trend Weight, read only in Maintenance Mode — while a Goal is active the pace lives on the Goal. */
    val trend: WeightTrend?,
) {
    val review = recent.firstOrNull()
    val targets = review?.intakeTargets

    // Sum each total once and reuse it for both the consumed field and the signed
    // remaining figure (the day verdict re-derives its own).
    val caloriesConsumed = log.caloriesConsumed()
    val proteinConsumed = log.proteinConsumed()
    val caloriesRemaining = targets?.let { it.calorieBudgetKcal - caloriesConsumed }
    val proteinRemaining = targets?.let { it.proteinFloorG - proteinConsumed }
    val dayStatus = targets?.let { log.dayStatus(it.calorieBudgetKcal, it.proteinFloorG) }

    // Maintenance Mode (ADR 0008): with no active Goal, the trend is paced against a
    // zero rate. One walk of the trend feeds both fields: the raw rate and its
    // classification.
    val observedRateKgPerWeek = trend?.observedRateKgPerWeek(log.date)
    val driftStatus = trend?.let { DriftStatus.forRate(observedRateKgPerWeek) }

    // Derived on read, never stored: a suspension lifts by itself the week
    // Maintenance recovers, so latching it into the review would leave a historical
    // claim the live state contradicts (ADR 0030).
    val deficitSuspended = targets?.takeIf { hasActiveGoal }?.appliesNoDeficit
}

/** Reads the [DailySummary] — and, because opening the app performs this read, advances its bookkeeping. */
@Service
class DailySummaryService(
    private val entries: EntryRepository,
    private val weeklyReview: WeeklyReviewService,
    private val goals: GoalRepository,
    private val weights: WeightMeasurementRepository,
    private val reminderState: ReminderStateRepository,
) {

    /** The summary of [date], the client's local day. */
    fun summary(date: LocalDate): DailySummary {
        // This read is what an app-open *means* for the reminder, so it is where two
        // app-open bookkeeping concerns advance. They read like one concern and are
        // not; ADR 0010, "What counts as showing up", carries the argument — including
        // why "any screen performs this read" is not true (only `/` and `/check` do).
        // The last-seen stamp is deferred to the end of this method — see there.
        //
        // Load-bearing: the weekly cadence advances here, with no scheduler — at most
        // one review, snapped to the client's local today, when due. This is what
        // stands down the day's reminder, and what lets a Check state its figures
        // against a current Budget.
        val setupComplete = weeklyReview.catchUpIfDue(date)
        val log = DailyLog(date, entries.findByDate(date))
        val recent = weeklyReview.reviewsStandingOn(date)
        val activeGoal = goals.findActive()
        val summary = DailySummary(
            setupComplete = setupComplete,
            log = log,
            recent = recent,
            hasActiveGoal = activeGoal != null,
            trend = if (activeGoal == null) WeightTrend.from(weights.findAll()) else null,
        )

        // Redundant, kept as a guard: last-seen on the client's local day (ADR 0014,
        // never the server's wall clock), feeding a reminder gate that the catch-up
        // above has already closed by the time the reminder asks.
        //
        // Stamped last, and deliberately: nothing here is transactional, so a stamp
        // written on the way in outlives a request that then fails, recording "the
        // user showed up" for an app-open that showed them nothing.
        //
        // Only this stamp, though. The catch-up above commits in its own transaction,
        // so on that same failed request the review is already written and it — not
        // this gate — is what stands the day's reminder down. Closing that too means
        // one transaction spanning both, which would also roll back a review that
        // legitimately ran; that is a change to the cadence, not to bookkeeping, and
        // wants deciding on its own.
        reminderState.stampSeen(date)
        return summary
    }
}
