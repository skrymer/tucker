package com.tucker.api

import com.tucker.domain.Maintenance
import com.tucker.domain.WeeklyReview
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.service.WeeklyReviewService
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/**
 * API representation of a WeeklyReview. Every review carries a Trend Weight;
 * [intakeTargets] is null for one run with Calorie Tracking off.
 */
data class WeeklyReviewResponse(
    val id: Long,
    val reviewedOn: LocalDate,
    val trendWeightKg: Double,
    val intakeTargets: IntakeTargetsResponse?,
)

/**
 * The intake half of a review, nested rather than flattened into four nullable
 * siblings — one branch unlocks all four ledger columns, and there is no shape in
 * which a Protein Floor arrives without the Calorie Budget it belongs to.
 */
data class IntakeTargetsResponse(
    val maintenanceKcal: Double,
    val maintenanceBasis: Maintenance.Basis,
    val calorieBudgetKcal: Double,
    val proteinFloorG: Double,
)

private fun WeeklyReview.toResponse() = WeeklyReviewResponse(
    id = persistedId(id),
    reviewedOn = reviewedOn,
    trendWeightKg = trendWeightKg,
    intakeTargets = intakeTargets?.let {
        IntakeTargetsResponse(
            maintenanceKcal = it.maintenance.kcal,
            maintenanceBasis = it.maintenance.basis,
            calorieBudgetKcal = it.calorieBudgetKcal,
            proteinFloorG = it.proteinFloorG,
        )
    },
)

@RestController
@RequestMapping("/api/weekly-review")
class WeeklyReviewController(
    private val reviews: WeeklyReviewRepository,
    private val weeklyReviewService: WeeklyReviewService,
    private val userToday: UserToday,
) {

    @GetMapping
    fun latest(): WeeklyReviewResponse =
        reviews.latest()?.toResponse() ?: throw NotFoundException("no weekly review has run yet")

    @GetMapping("/history")
    fun history(): List<WeeklyReviewResponse> = reviews.findAll().map { it.toResponse() }

    /**
     * Run the adaptive weekly review now. Idempotent: if today already has a review
     * (e.g. the lazy catch-up minted one on app open), returns it rather than minting
     * a duplicate — hence 200, not 201. [clientToday] is the user's local date the
     * review is stamped on (ADR 0014); falls back to the server date when omitted.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.OK)
    fun run(
        @RequestParam(required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        clientToday: LocalDate?,
    ): WeeklyReviewResponse =
        weeklyReviewService.runReview(userToday.resolve(clientToday)).toResponse()
}
