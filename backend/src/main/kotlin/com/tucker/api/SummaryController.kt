package com.tucker.api

import com.tucker.domain.DailyLog
import com.tucker.domain.DayStatus
import com.tucker.domain.DriftStatus
import com.tucker.domain.WeeklyReview
import com.tucker.domain.WeightTrend
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.ReminderStateRepository
import com.tucker.persistence.WeightMeasurementRepository
import com.tucker.service.WeeklyReviewService
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/**
 * The dashboard view of one day: intake against the Calorie Budget and Protein
 * Floor. Budget and floor are null until the first WeeklyReview has run.
 */
data class DailySummaryResponse(
    val date: LocalDate,
    /**
     * Whether this User has a Profile and at least one Weight Measurement — the
     * inputs a Weekly Review needs. Orthogonal to Calorie Tracking: a weight-only
     * User with no reading is genuinely not set up, while one who has weighed in is
     * finished and should never be told otherwise, even though they have no Budget.
     */
    val setupComplete: Boolean,
    val caloriesConsumed: Double,
    val proteinConsumed: Double,
    val estimatedCalorieShare: Double,
    val calorieBudget: Double?,
    val proteinFloor: Double?,
    val caloriesRemaining: Double?,
    val proteinRemaining: Double?,
    /**
     * The day's earned verdict (DayStatus): "on-target", "over-budget", or
     * "in-progress" — null until the first WeeklyReview has run. An in-progress
     * day carries no verdict; the progress bars carry the numbers.
     */
    val dayStatus: DayStatus?,
    /** The smoothed Trend Weight from the latest review; null until the first runs. */
    val trendWeightKg: Double?,
    val entries: List<EntryResponse>,
    val budgetChange: BudgetChange?,
    /**
     * Drift Status against a zero target rate (ADR 0008), populated only in
     * Maintenance Mode (no active Goal); "gathering-data" until 14 days of
     * measurements exist. Null while a Goal is active — pace lives on the Goal.
     */
    val driftStatus: DriftStatus?,
    /** The trailing 28-day Trend-Weight slope (kg/week); null outside Maintenance Mode or before 14 days. */
    val observedRateKgPerWeek: Double?,
)

/**
 * A weekly review moved the Calorie Budget or Protein Floor — so the daily
 * number never changes silently. Present only when the latest review is the
 * second or later and its budget or floor differs from the one before it; the
 * first-ever review has no prior figure to have changed from, and neither does
 * one on the far side of a stretch with Calorie Tracking off.
 */
data class BudgetChange(
    val reviewId: Long,
    val previousBudgetKcal: Double,
    val newBudgetKcal: Double,
    val previousFloorG: Double,
    val newFloorG: Double,
) {
    companion object {
        /**
         * The change from [previous] to [latest] — null if neither figure moved, and
         * null if either review carries no targets: a Budget that was never published
         * cannot have moved, and stating a jump across the gap would invent one.
         */
        fun between(previous: WeeklyReview, latest: WeeklyReview): BudgetChange? {
            val before = previous.intakeTargets
            val after = latest.intakeTargets
            if (before == null || after == null) return null
            val moved = after.calorieBudgetKcal != before.calorieBudgetKcal ||
                after.proteinFloorG != before.proteinFloorG
            return if (moved) {
                BudgetChange(
                    reviewId = latest.id!!,
                    previousBudgetKcal = before.calorieBudgetKcal,
                    newBudgetKcal = after.calorieBudgetKcal,
                    previousFloorG = before.proteinFloorG,
                    newFloorG = after.proteinFloorG,
                )
            } else {
                null
            }
        }
    }
}

@RestController
@RequestMapping("/api/summary")
class SummaryController(
    private val entries: EntryRepository,
    private val foods: FoodRepository,
    private val weeklyReview: WeeklyReviewService,
    private val goals: GoalRepository,
    private val weights: WeightMeasurementRepository,
    private val reminderState: ReminderStateRepository,
) {

    @GetMapping
    fun summary(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate,
    ): DailySummaryResponse {
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
        val recent = weeklyReview.recentReviews()
        val review = recent.firstOrNull()
        val targets = review?.intakeTargets
        val budgetChange = recent.takeIf { it.size == 2 }
            ?.let { BudgetChange.between(previous = it[1], latest = it[0]) }

        // Maintenance Mode (ADR 0008): with no active Goal, the trend is paced
        // against a zero rate. While a Goal is active the pace lives on the Goal,
        // so the summary leaves these null.
        val trend = if (goals.findActive() == null) WeightTrend.from(weights.findAll()) else null
        // One walk of the trend feeds both fields: the raw rate and its classification.
        val observedRateKgPerWeek = trend?.observedRateKgPerWeek(date)
        val driftStatus = trend?.let { DriftStatus.forRate(observedRateKgPerWeek) }

        // Sum each total once and reuse it for both the consumed field and the
        // signed remaining figure (the day verdict re-derives its own).
        val caloriesConsumed = log.caloriesConsumed()
        val proteinConsumed = log.proteinConsumed()

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

        return DailySummaryResponse(
            date = date,
            setupComplete = setupComplete,
            caloriesConsumed = caloriesConsumed,
            proteinConsumed = proteinConsumed,
            estimatedCalorieShare = log.estimatedCalorieShare(),
            calorieBudget = targets?.calorieBudgetKcal,
            proteinFloor = targets?.proteinFloorG,
            caloriesRemaining = targets?.let { it.calorieBudgetKcal - caloriesConsumed },
            proteinRemaining = targets?.let { it.proteinFloorG - proteinConsumed },
            dayStatus = targets?.let { log.dayStatus(it.calorieBudgetKcal, it.proteinFloorG) },
            trendWeightKg = review?.trendWeightKg,
            entries = log.entries.toResponses(foods),
            budgetChange = budgetChange,
            driftStatus = driftStatus,
            observedRateKgPerWeek = observedRateKgPerWeek,
        )
    }
}
