package com.tucker.service

import com.tucker.domain.WeightMeasurement
import com.tucker.persistence.WeightMeasurementRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

/**
 * Application logic for recording a [WeightMeasurement]. A measurement write is the
 * only moment the smoothed Trend Weight can move, so it is also the one place a Goal
 * can cross its target — after persisting the reading we stamp the active Goal as
 * reached if it just crossed (ADR 0008). Both run in one transaction.
 */
@Service
class WeightMeasurementService(
    private val weights: WeightMeasurementRepository,
    private val goals: GoalService,
) {

    @Transactional
    fun save(measurement: WeightMeasurement, today: LocalDate = LocalDate.now()): WeightMeasurement {
        val saved = weights.save(measurement)
        goals.stampReachedIfCrossed(today)
        return saved
    }
}
