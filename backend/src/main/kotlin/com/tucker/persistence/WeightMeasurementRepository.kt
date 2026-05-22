package com.tucker.persistence

import com.tucker.domain.WeightMeasurement
import com.tucker.jooq.Tables.WEIGHT_MEASUREMENT
import com.tucker.jooq.tables.records.WeightMeasurementRecord
import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import java.time.LocalDate

/** Persistence for [WeightMeasurement] — one reading per day. */
@Repository
class WeightMeasurementRepository(private val dsl: DSLContext) {

    fun findAll(): List<WeightMeasurement> =
        dsl.selectFrom(WEIGHT_MEASUREMENT)
            .orderBy(WEIGHT_MEASUREMENT.MEASURED_ON)
            .fetch().map { it.toDomain() }

    fun findOn(date: LocalDate): WeightMeasurement? =
        dsl.selectFrom(WEIGHT_MEASUREMENT)
            .where(WEIGHT_MEASUREMENT.MEASURED_ON.eq(date.toString()))
            .fetchOne()?.toDomain()

    /** Insert the reading, or replace an existing reading for the same day. */
    fun save(measurement: WeightMeasurement): WeightMeasurement {
        val existing = dsl.selectFrom(WEIGHT_MEASUREMENT)
            .where(WEIGHT_MEASUREMENT.MEASURED_ON.eq(measurement.measuredOn.toString()))
            .fetchOne()
        if (existing != null) {
            dsl.update(WEIGHT_MEASUREMENT)
                .set(WEIGHT_MEASUREMENT.WEIGHT_KG, measurement.weightKg.toFloat())
                .where(WEIGHT_MEASUREMENT.ID.eq(existing.id))
                .execute()
            return measurement.copy(id = existing.id!!.toLong())
        }
        val rec = dsl.newRecord(WEIGHT_MEASUREMENT)
        rec.measuredOn = measurement.measuredOn.toString()
        rec.weightKg = measurement.weightKg.toFloat()
        rec.store()
        return measurement.copy(id = rec.id!!.toLong())
    }

    private fun WeightMeasurementRecord.toDomain(): WeightMeasurement = WeightMeasurement(
        id = id!!.toLong(),
        measuredOn = LocalDate.parse(measuredOn),
        weightKg = weightKg.toDouble(),
    )
}
