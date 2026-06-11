package com.tucker.api

import com.tucker.domain.Goal
import com.tucker.domain.GoalProgress
import com.tucker.domain.WeightTrend
import com.tucker.persistence.GoalRepository
import com.tucker.persistence.WeightMeasurementRepository
import com.tucker.service.GoalService
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
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
    /** The date this Goal was reached (trend met target), or null if never reached (ADR 0008). */
    val reachedOn: LocalDate?,
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
    /** The date this Goal was reached (trend met target), or null while still pursuing it (ADR 0008). */
    val reachedOn: LocalDate?,
)

/**
 * Request to set a new weight-loss Goal.
 *
 * The start weight is *not* sent: it's the live Trend Weight at creation, derived
 * by the backend (ADR 0016), so a fresh Goal reads 0% (start == now) and the
 * client never has to compute the EWMA.
 *
 * [clientToday] is the user's *local* date (ADR 0014): the day the forced review
 * recompute is stamped on, so the lifted Budget lands on the user's today rather
 * than the server's wall-clock day. Validated against the server clock; falls back
 * to the server date when omitted.
 */
data class CreateGoalRequest(
    val startedOn: LocalDate,
    val targetWeightKg: Double,
    val rateKgPerWeek: Double,
    val clientToday: LocalDate? = null,
)

private fun GoalProgress.toResponse(reachedOn: LocalDate?) = GoalProgressResponse(
    startWeightKg = startWeightKg,
    targetWeightKg = targetWeightKg,
    currentTrendKg = currentTrendKg,
    kgToGo = kgToGo,
    percentComplete = percentComplete,
    plannedFinishDate = plannedFinishDate,
    plannedRateKgPerWeek = plannedRateKgPerWeek,
    paceStatus = paceStatus?.value,
    observedRateKgPerWeek = observedRateKgPerWeek,
    observedFinishDate = observedFinishDate,
    reachedOn = reachedOn,
)

private fun Goal.toResponse() = GoalResponse(
    id = persistedId(id),
    startedOn = startedOn,
    startWeightKg = startWeightKg,
    targetWeightKg = targetWeightKg,
    rateKgPerWeek = rateKgPerWeek,
    active = active,
    dailyDeficitKcal = dailyDeficitKcal(),
    reachedOn = reachedOn,
)

@RestController
@RequestMapping("/api")
class GoalController(
    private val goals: GoalRepository,
    private val goalService: GoalService,
    private val weights: WeightMeasurementRepository,
    private val userToday: UserToday,
) {

    @GetMapping("/goal")
    fun active(): GoalResponse =
        goals.findActive()?.toResponse() ?: throw NotFoundException("no active Goal")

    @GetMapping("/goal/progress")
    fun progress(): GoalProgressResponse {
        val goal = goals.findActive() ?: throw NotFoundException("no active Goal")
        // Progress runs on the smoothed Trend Weight; the observed pace reads its
        // slope over the trailing window. Before any reading exists, the user is
        // by definition still at the Goal's captured start weight.
        val trend = WeightTrend.from(weights.findAll())
        return GoalProgress.forGoal(goal, trend, userToday.serverToday()).toResponse(goal.reachedOn)
    }

    /** Every Goal, newest first — the active one plus inactive history. */
    @GetMapping("/goals")
    fun history(): List<GoalResponse> = goals.findAll().map { it.toResponse() }

    @PostMapping("/goal")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody request: CreateGoalRequest): GoalResponse =
        goalService.createGoal(
            request.startedOn,
            request.targetWeightKg,
            request.rateKgPerWeek,
            userToday.resolve(request.clientToday),
        ).toResponse()

    /**
     * Switch to Maintenance Mode (ADR 0008): deactivate the active Goal and
     * force-recompute today's review so the Budget lifts to Maintenance at once.
     * Idempotent — a no-op when no Goal is active. [clientToday] is the user's
     * local date (ADR 0014) the lift is stamped on; falls back to the server date.
     */
    @DeleteMapping("/goal")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deactivate(
        @RequestParam(required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        clientToday: LocalDate?,
    ) = goalService.deactivateActiveGoal(userToday.resolve(clientToday))
}
