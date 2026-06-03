package com.tucker.api

import com.tucker.domain.Goal
import com.tucker.domain.GoalProgress
import com.tucker.domain.WeightTrend
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.WeightMeasurementRepository
import com.tucker.service.GoalService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/** API representation of a Goal, including its derived daily deficit. */
data class GoalResponse(
    val id: Long,
    val startedOn: LocalDate,
    val startWeightKg: Double,
    val targetWeightKg: Double,
    val rateKgPerWeek: Double,
    val active: Boolean,
    val dailyDeficitKcal: Double,
)

/**
 * Progress against the active Goal. The planned fields project from the Goal and
 * the live Trend Weight; the pace fields (how the trend is *actually* moving) are
 * a later slice and are null until then.
 */
data class GoalProgressResponse(
    val startWeightKg: Double,
    val targetWeightKg: Double,
    val currentTrendKg: Double,
    val kgToGo: Double,
    val percentComplete: Double,
    val plannedFinishDate: LocalDate,
    val plannedRateKgPerWeek: Double,
    val paceStatus: String?,
    val observedRateKgPerWeek: Double?,
    val observedFinishDate: LocalDate?,
)

/** Request to set a new weight-loss Goal. */
data class CreateGoalRequest(
    val startedOn: LocalDate,
    val startWeightKg: Double,
    val targetWeightKg: Double,
    val rateKgPerWeek: Double,
)

private fun GoalProgress.toResponse() = GoalProgressResponse(
    startWeightKg = startWeightKg,
    targetWeightKg = targetWeightKg,
    currentTrendKg = currentTrendKg,
    kgToGo = kgToGo,
    percentComplete = percentComplete,
    plannedFinishDate = plannedFinishDate,
    plannedRateKgPerWeek = plannedRateKgPerWeek,
    paceStatus = null,
    observedRateKgPerWeek = null,
    observedFinishDate = null,
)

private fun Goal.toResponse() = GoalResponse(
    id = persistedId(id),
    startedOn = startedOn,
    startWeightKg = startWeightKg,
    targetWeightKg = targetWeightKg,
    rateKgPerWeek = rateKgPerWeek,
    active = active,
    dailyDeficitKcal = dailyDeficitKcal(),
)

@RestController
@RequestMapping("/api")
class GoalController(
    private val goals: GoalRepository,
    private val goalService: GoalService,
    private val weights: WeightMeasurementRepository,
) {

    @GetMapping("/goal")
    fun active(): GoalResponse =
        goals.findActive()?.toResponse() ?: throw NotFoundException("no active Goal")

    @GetMapping("/goal/progress")
    fun progress(): GoalProgressResponse {
        val goal = goals.findActive() ?: throw NotFoundException("no active Goal")
        // Progress runs on the smoothed Trend Weight; before any reading exists,
        // the user is by definition still at the Goal's captured start weight.
        val currentTrendKg = WeightTrend.from(weights.findAll()).latest()?.trendKg
            ?: goal.startWeightKg
        return GoalProgress.planned(goal, currentTrendKg, LocalDate.now()).toResponse()
    }

    /** Every Goal, newest first — the active one plus inactive history. */
    @GetMapping("/goals")
    fun history(): List<GoalResponse> = goals.findAll().map { it.toResponse() }

    @PostMapping("/goal")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody request: CreateGoalRequest): GoalResponse {
        val goal = Goal(
            id = null,
            startedOn = request.startedOn,
            startWeightKg = request.startWeightKg,
            targetWeightKg = request.targetWeightKg,
            rateKgPerWeek = request.rateKgPerWeek,
            active = true,
        )
        return goalService.replaceActiveGoal(goal).toResponse()
    }
}
