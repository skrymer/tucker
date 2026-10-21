package com.tucker.persistence

import com.tucker.domain.MetricBatch
import com.tucker.domain.MetricEvent
import com.tucker.domain.MetricKind
import com.tucker.domain.MetricLayout
import com.tucker.domain.MetricSource
import com.tucker.jooq.Tables.METRIC_EVENT
import com.tucker.jooq.tables.records.MetricEventRecord
import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import java.time.Instant

/**
 * Persistence for [MetricEvent]s — Tucker's own, so unscoped: the one repository with no
 * [com.tucker.security.CurrentUser], because no row here belongs to a User (ADR 0038).
 */
@Repository
class MetricEventRepository(private val dsl: DSLContext) {

    fun insert(batch: MetricBatch, recordedAt: Instant) {
        dsl.batchInsert(batch.events.map { it.toRecord(recordedAt) }).execute()
    }

    fun findAll(): List<MetricEvent> =
        dsl.selectFrom(METRIC_EVENT).fetch().map { it.toDomain() }

    private fun MetricEvent.toRecord(recordedAt: Instant) = MetricEventRecord().also {
        it.kind = kind.wire
        it.route = route
        it.valueMs = valueMs
        it.apiMs = apiMs
        it.serverMs = serverMs
        it.firstVisit = firstVisit?.toFlag()
        it.layout = source.layout.wire
        it.installed = source.installed.toFlag()
        it.appVersion = source.appVersion
        it.recordedAt = recordedAt.toString()
    }

    private fun MetricEventRecord.toDomain() = MetricEvent(
        kind = MetricKind.of(kind),
        route = route,
        valueMs = valueMs,
        apiMs = apiMs,
        serverMs = serverMs,
        firstVisit = firstVisit?.isFlagSet(),
        source = MetricSource(MetricLayout.of(layout), installed.isFlagSet(), appVersion),
    )
}
