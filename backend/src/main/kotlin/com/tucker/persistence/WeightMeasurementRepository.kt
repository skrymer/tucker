package com.tucker.persistence

import com.tucker.domain.WeightMeasurement
import com.tucker.jooq.Tables.WEIGHT_MEASUREMENT
import com.tucker.jooq.tables.records.WeightMeasurementRecord
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import java.time.LocalDate

/**
 * Persistence for [WeightMeasurement] — one reading per day, per User (ADR 0021).
 *
 * Scoped implicitly like the catalog, so no method here takes an owner. The day
 * is the reason this matters more than it looks: [save] replaces the reading for
 * a date, and an unscoped lookup for that date would find *somebody else's* row
 * and quietly overwrite their scale reading with yours.
 */
@Repository
class WeightMeasurementRepository(
    private val dsl: DSLContext,
    private val currentUser: CurrentUser,
) {

    fun findAll(): List<WeightMeasurement> =
        dsl.selectFrom(WEIGHT_MEASUREMENT)
            .where(WEIGHT_MEASUREMENT.USER_ID.eq(currentUser.ownerId))
            .orderBy(WEIGHT_MEASUREMENT.MEASURED_ON)
            .fetch().map { it.toDomain() }

    fun findOn(date: LocalDate): WeightMeasurement? =
        dsl.selectFrom(WEIGHT_MEASUREMENT)
            .where(WEIGHT_MEASUREMENT.MEASURED_ON.eq(date.toString()))
            .and(WEIGHT_MEASUREMENT.USER_ID.eq(currentUser.ownerId))
            .fetchOne()?.toDomain()

    fun latest(): WeightMeasurement? =
        dsl.selectFrom(WEIGHT_MEASUREMENT)
            .where(WEIGHT_MEASUREMENT.USER_ID.eq(currentUser.ownerId))
            .orderBy(WEIGHT_MEASUREMENT.MEASURED_ON.desc())
            .limit(1)
            .fetchOne()?.toDomain()

    fun deleteById(id: Long): Int =
        dsl.deleteFrom(WEIGHT_MEASUREMENT)
            .where(WEIGHT_MEASUREMENT.ID.eq(id.toInt()))
            .and(WEIGHT_MEASUREMENT.USER_ID.eq(currentUser.ownerId))
            .execute()

    /** Insert the reading, or replace the caller's own reading for the same day. */
    fun save(measurement: WeightMeasurement): WeightMeasurement {
        val existing = dsl.selectFrom(WEIGHT_MEASUREMENT)
            .where(WEIGHT_MEASUREMENT.MEASURED_ON.eq(measurement.measuredOn.toString()))
            .and(WEIGHT_MEASUREMENT.USER_ID.eq(currentUser.ownerId))
            .fetchOne()
        if (existing != null) {
            dsl.update(WEIGHT_MEASUREMENT)
                .set(WEIGHT_MEASUREMENT.WEIGHT_KG, measurement.weightKg)
                .where(WEIGHT_MEASUREMENT.ID.eq(existing.id))
                .and(WEIGHT_MEASUREMENT.USER_ID.eq(currentUser.ownerId))
                .execute()
            return measurement.copy(id = existing.id!!.toLong())
        }
        val rec = dsl.newRecord(WEIGHT_MEASUREMENT)
        rec.userId = currentUser.ownerId
        rec.measuredOn = measurement.measuredOn.toString()
        rec.weightKg = measurement.weightKg
        rec.store()
        return measurement.copy(id = rec.id!!.toLong())
    }

    private fun WeightMeasurementRecord.toDomain(): WeightMeasurement = WeightMeasurement(
        id = id!!.toLong(),
        measuredOn = LocalDate.parse(measuredOn),
        weightKg = weightKg,
    )
}
