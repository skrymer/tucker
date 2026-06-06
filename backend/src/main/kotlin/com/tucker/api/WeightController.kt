package com.tucker.api

import com.tucker.domain.WeightMeasurement
import com.tucker.persistence.WeightMeasurementRepository
import com.tucker.service.WeightMeasurementService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/** API representation of a weight reading. */
data class WeightMeasurementResponse(
    val id: Long,
    val measuredOn: LocalDate,
    val weightKg: Double,
)

/**
 * Request to record a weight reading (replaces an existing reading for the day).
 *
 * [clientToday] is the user's *local* date, which the backend validates
 * [date] against. The server's own date is in UTC and can lag the user's local
 * date by up to a day, which would otherwise reject a perfectly valid
 * "today" weight across the midnight boundary (see issue #24). When omitted it
 * falls back to the server's date.
 */
data class SaveWeightRequest(
    val date: LocalDate,
    val weightKg: Double,
    val clientToday: LocalDate? = null,
)

private fun WeightMeasurement.toResponse() = WeightMeasurementResponse(
    id = persistedId(id),
    measuredOn = measuredOn,
    weightKg = weightKg,
)

@RestController
@RequestMapping("/api/weight")
class WeightController(
    private val weights: WeightMeasurementRepository,
    private val weightService: WeightMeasurementService,
    private val userToday: UserToday,
) {

    @GetMapping
    fun list(): List<WeightMeasurementResponse> = weights.findAll().map { it.toResponse() }

    @GetMapping("/latest")
    fun latest(): WeightMeasurementResponse =
        weights.latest()?.toResponse() ?: throw NotFoundException("no weight measurements recorded yet")

    @PostMapping
    fun save(@RequestBody request: SaveWeightRequest): WeightMeasurementResponse {
        val today = userToday.resolve(request.clientToday)
        return weightService.save(
            WeightMeasurement.recorded(
                measuredOn = request.date,
                weightKg = request.weightKg,
                today = today,
            ),
            today,
        ).toResponse()
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: Long) {
        weights.deleteById(id)
    }
}
