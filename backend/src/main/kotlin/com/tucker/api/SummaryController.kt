package com.tucker.api

import com.tucker.domain.DayStatus
import com.tucker.domain.DriftStatus
import com.tucker.domain.Maintenance
import com.tucker.domain.WeeklyReview
import com.tucker.persistence.FoodRepository
import com.tucker.service.DailySummary
import com.tucker.service.DailySummaryService
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import kotlin.math.roundToLong

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
    /**
     * Why the latest review carried its Maintenance forward instead of correcting it,
     * so `/` can name the one thing that would lift the Budget (ADR 0031). Null
     * whenever there is nothing to explain — the figure was measured or seeded, there
     * is no review yet, or the review was held before Tucker recorded a reason.
     */
    val heldReason: Maintenance.HeldReason?,
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
    /**
     * Whether the active Goal's rate demands more daily deficit than Maintenance can
     * supply, so none is applied and the Calorie Budget *is* Maintenance (ADR 0030).
     * Null where the question does not arise — no active Goal, or no Intake Targets
     * to have a Budget in.
     */
    val deficitSuspended: Boolean?,
) {
    /** [summary] on the wire, its Entries already named. */
    constructor(summary: DailySummary, entries: List<EntryResponse>) : this(
        date = summary.log.date,
        setupComplete = summary.setupComplete,
        caloriesConsumed = summary.caloriesConsumed,
        proteinConsumed = summary.proteinConsumed,
        estimatedCalorieShare = summary.estimatedCalorieShare,
        calorieBudget = summary.targets?.calorieBudgetKcal,
        proteinFloor = summary.targets?.proteinFloorG,
        caloriesRemaining = summary.caloriesRemaining,
        proteinRemaining = summary.proteinRemaining,
        dayStatus = summary.dayStatus,
        trendWeightKg = summary.review?.trendWeightKg,
        heldReason = summary.targets?.maintenance?.heldReason,
        entries = entries,
        budgetChange = summary.recent.takeIf { it.size == 2 }
            ?.let { BudgetChange.between(previous = it[1], latest = it[0]) },
        driftStatus = summary.driftStatus,
        observedRateKgPerWeek = summary.observedRateKgPerWeek,
        deficitSuspended = summary.deficitSuspended,
    )
}

/**
 * A weekly review moved the Calorie Budget or Protein Floor — so the daily
 * number never changes silently. Present only when the latest review is the
 * second or later and its budget or floor differs from the one before it; the
 * first-ever review has no prior figure to have changed from, and neither does
 * one on the far side of a stretch with Calorie Tracking off.
 */
data class BudgetChange(
    val reviewId: Long,
    val previousBudgetKcal: Long,
    val newBudgetKcal: Long,
    val previousFloorG: Long,
    val newFloorG: Long,
) {
    companion object {
        /**
         * The change from [previous] to [latest] — null if neither figure moved, and
         * null if either review carries no targets: a Budget that was never published
         * cannot have moved, and stating a jump across the gap would invent one.
         *
         * "Moved" is asked of the figures the User is *shown*, not of the raw doubles,
         * which is why this publishes whole numbers: a sub-unit drift renders the same
         * on both rows, and a banner announcing it would contradict its own headline.
         * Rounding is ordinarily the client's, and here the decision depends on it — so
         * the rule lives here alone and the banner has none to disagree with (ADR 0002).
         */
        fun between(previous: WeeklyReview, latest: WeeklyReview): BudgetChange? {
            val before = previous.intakeTargets
            val after = latest.intakeTargets
            if (before == null || after == null) return null
            val change = BudgetChange(
                reviewId = latest.id,
                previousBudgetKcal = before.calorieBudgetKcal.roundToLong(),
                newBudgetKcal = after.calorieBudgetKcal.roundToLong(),
                previousFloorG = before.proteinFloorG.roundToLong(),
                newFloorG = after.proteinFloorG.roundToLong(),
            )
            val moved = change.newBudgetKcal != change.previousBudgetKcal ||
                change.newFloorG != change.previousFloorG
            return change.takeIf { moved }
        }
    }
}

@RestController
@RequestMapping("/api/summary")
class SummaryController(
    private val dailySummary: DailySummaryService,
    private val foods: FoodRepository,
) {

    /** The summary of [date], the client's local day — reading it is what an app-open means (ADR 0010). */
    @GetMapping
    fun summary(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate,
    ): DailySummaryResponse {
        val summary = dailySummary.summary(date)
        return DailySummaryResponse(summary, entries = summary.log.entries.toResponses(foods))
    }
}
