package com.tucker.api

import com.tucker.domain.WeightMeasurement
import com.tucker.persistence.WeightMeasurementRepository
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
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

    @PostMapping
    fun save(@RequestBody request: SaveWeightRequest): WeightMeasurementResponse =
        weights.save(WeightMeasurement(null, request.date, request.weightKg)).toResponse()
}
