package com.tucker.api

import com.tucker.domain.DailyLog
import com.tucker.domain.WeeklyReview
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.WeeklyReviewRepository
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
    val caloriesConsumed: Double,
    val proteinConsumed: Double,
    val estimatedCalorieShare: Double,
    val calorieBudget: Double?,
    val proteinFloor: Double?,
    val caloriesRemaining: Double?,
    val onTarget: Boolean?,
    /** The smoothed Trend Weight from the latest review; null until the first runs. */
    val trendWeightKg: Double?,
    val entries: List<EntryResponse>,
    val budgetChange: BudgetChange?,
)

/**
 * A weekly review moved the Calorie Budget or Protein Floor — so the daily
 * number never changes silently. Present only when the latest review is the
 * second or later and its budget or floor differs from the one before it; the
 * first-ever review has no prior figure to have changed from.
 */
data class BudgetChange(
    val reviewId: Long,
    val previousBudgetKcal: Double,
    val newBudgetKcal: Double,
    val previousFloorG: Double,
    val newFloorG: Double,
) {
    companion object {
        /** The change from [previous] to [latest], or null if neither figure moved. */
        fun between(previous: WeeklyReview, latest: WeeklyReview): BudgetChange? {
            val moved = latest.calorieBudgetKcal != previous.calorieBudgetKcal ||
                latest.proteinFloorG != previous.proteinFloorG
            if (!moved) return null
            return BudgetChange(
                reviewId = latest.id!!,
                previousBudgetKcal = previous.calorieBudgetKcal,
                newBudgetKcal = latest.calorieBudgetKcal,
                previousFloorG = previous.proteinFloorG,
                newFloorG = latest.proteinFloorG,
            )
        }
    }
}

@RestController
@RequestMapping("/api/summary")
class SummaryController(
    private val entries: EntryRepository,
    private val reviews: WeeklyReviewRepository,
    private val foods: FoodRepository,
    private val weeklyReview: WeeklyReviewService,
) {

    @GetMapping
    fun summary(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate,
    ): DailySummaryResponse {
        // Lazy catch-up: the summary is read on every app open, so it's where the
        // weekly cadence advances — no scheduler. Runs at most one review, snapped
        // to the client's local today, and only when one is due.
        weeklyReview.catchUpIfDue(date)

        val log = DailyLog(date, entries.findByDate(date))
        val recent = reviews.latestTwo()
        val review = recent.firstOrNull()
        val budgetChange = recent.takeIf { it.size == 2 }
            ?.let { BudgetChange.between(previous = it[1], latest = it[0]) }
        return DailySummaryResponse(
            date = date,
            caloriesConsumed = log.caloriesConsumed(),
            proteinConsumed = log.proteinConsumed(),
            estimatedCalorieShare = log.estimatedCalorieShare(),
            calorieBudget = review?.calorieBudgetKcal,
            proteinFloor = review?.proteinFloorG,
            caloriesRemaining = review?.let { it.calorieBudgetKcal - log.caloriesConsumed() },
            onTarget = review?.let { log.isOnTarget(it.calorieBudgetKcal, it.proteinFloorG) },
            trendWeightKg = review?.trendWeightKg,
            entries = log.entries.toResponses(foods),
            budgetChange = budgetChange,
        )
    }
}
