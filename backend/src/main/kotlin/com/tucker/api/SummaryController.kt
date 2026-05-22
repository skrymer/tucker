package com.tucker.api

import com.tucker.domain.DailyLog
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.WeeklyReviewRepository
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
    val entries: List<EntryResponse>,
)

@RestController
@RequestMapping("/api/summary")
class SummaryController(
    private val entries: EntryRepository,
    private val reviews: WeeklyReviewRepository,
    private val foods: FoodRepository,
) {

    @GetMapping
    fun summary(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate,
    ): DailySummaryResponse {
        val log = DailyLog(date, entries.findByDate(date))
        val review = reviews.latest()
        return DailySummaryResponse(
            date = date,
            caloriesConsumed = log.caloriesConsumed(),
            proteinConsumed = log.proteinConsumed(),
            estimatedCalorieShare = log.estimatedCalorieShare(),
            calorieBudget = review?.calorieBudgetKcal,
            proteinFloor = review?.proteinFloorG,
            caloriesRemaining = review?.let { it.calorieBudgetKcal - log.caloriesConsumed() },
            onTarget = review?.let { log.isOnTarget(it.calorieBudgetKcal, it.proteinFloorG) },
            entries = log.entries.toResponses(foods),
        )
    }
}
