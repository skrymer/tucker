package com.tucker.api

import com.tucker.domain.WeeklyReview
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.service.WeeklyReviewService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/** API representation of a WeeklyReview. */
data class WeeklyReviewResponse(
    val id: Long,
    val reviewedOn: LocalDate,
    val trendWeightKg: Double,
    val maintenanceKcal: Double,
    val calorieBudgetKcal: Double,
    val proteinFloorG: Double,
    val note: String?,
)

private fun WeeklyReview.toResponse() = WeeklyReviewResponse(
    id = persistedId(id),
    reviewedOn = reviewedOn,
    trendWeightKg = trendWeightKg,
    maintenanceKcal = maintenanceKcal,
    calorieBudgetKcal = calorieBudgetKcal,
    proteinFloorG = proteinFloorG,
    note = note,
)

@RestController
@RequestMapping("/api/weekly-review")
class WeeklyReviewController(
    private val reviews: WeeklyReviewRepository,
    private val weeklyReviewService: WeeklyReviewService,
) {

    @GetMapping
    fun latest(): WeeklyReviewResponse =
        reviews.latest()?.toResponse() ?: throw NotFoundException("no weekly review has run yet")

    @GetMapping("/history")
    fun history(): List<WeeklyReviewResponse> = reviews.findAll().map { it.toResponse() }

    /** Run the adaptive weekly review now. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun run(): WeeklyReviewResponse =
        weeklyReviewService.runReview(LocalDate.now()).toResponse()
}
