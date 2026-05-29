package com.tucker.api

import com.tucker.domain.Goal
import com.tucker.persistence.GoalRepository
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

/** Request to set a new weight-loss Goal. */
data class CreateGoalRequest(
    val startedOn: LocalDate,
    val startWeightKg: Double,
    val targetWeightKg: Double,
    val rateKgPerWeek: Double,
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
) {

    @GetMapping("/goal")
    fun active(): GoalResponse =
        goals.findActive()?.toResponse() ?: throw NotFoundException("no active Goal")

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
