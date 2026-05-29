package com.tucker.api

import com.tucker.domain.WeightMeasurement
import com.tucker.persistence.WeightMeasurementRepository
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

/** Request to record a weight reading (replaces an existing reading for the day). */
data class SaveWeightRequest(
    val date: LocalDate,
    val weightKg: Double,
)

private fun WeightMeasurement.toResponse() = WeightMeasurementResponse(
    id = persistedId(id),
    measuredOn = measuredOn,
    weightKg = weightKg,
)

@RestController
@RequestMapping("/api/weight")
class WeightController(private val weights: WeightMeasurementRepository) {

    @GetMapping
    fun list(): List<WeightMeasurementResponse> = weights.findAll().map { it.toResponse() }

    @GetMapping("/latest")
    fun latest(): WeightMeasurementResponse =
        weights.latest()?.toResponse() ?: throw NotFoundException("no weight measurements recorded yet")

    @PostMapping
    fun save(@RequestBody request: SaveWeightRequest): WeightMeasurementResponse =
        weights.save(
            WeightMeasurement.recorded(
                measuredOn = request.date,
                weightKg = request.weightKg,
                today = LocalDate.now(),
            ),
        ).toResponse()

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: Long) {
        weights.deleteById(id)
    }
}
