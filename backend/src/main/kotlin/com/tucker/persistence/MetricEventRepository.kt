package com.tucker.persistence

import com.tucker.domain.BrowserEngine
import com.tucker.domain.MetricBatch
import com.tucker.domain.MetricEvent
import com.tucker.domain.MetricFilter
import com.tucker.domain.MetricKind
import com.tucker.domain.MetricLayout
import com.tucker.domain.MetricSource
import com.tucker.domain.OperatingSystem
import com.tucker.domain.Platform
import com.tucker.jooq.Tables.METRIC_EVENT
import com.tucker.jooq.tables.records.MetricEventRecord
import org.jooq.DSLContext
import org.jooq.impl.DSL.max
import org.jooq.impl.DSL.noCondition
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

    fun find(filter: MetricFilter): List<MetricEvent> =
        dsl.selectFrom(METRIC_EVENT)
            .where(METRIC_EVENT.RECORDED_AT.ge(filter.since.toString()))
            .and(filter.engine?.let { METRIC_EVENT.ENGINE.eq(it.wire) } ?: noCondition())
            .and(filter.appVersion?.let { METRIC_EVENT.APP_VERSION.eq(it) } ?: noCondition())
            .and(filter.installed?.let { METRIC_EVENT.INSTALLED.eq(it.toFlag()) } ?: noCondition())
            .fetch()
            .map { it.toDomain() }

    /** The app versions recorded since [since], the one recorded most recently first. */
    fun versionsSince(since: Instant): List<String> =
        dsl.select(METRIC_EVENT.APP_VERSION)
            .from(METRIC_EVENT)
            .where(METRIC_EVENT.RECORDED_AT.ge(since.toString()))
            .groupBy(METRIC_EVENT.APP_VERSION)
            .orderBy(max(METRIC_EVENT.RECORDED_AT).desc())
            .fetch(METRIC_EVENT.APP_VERSION)

    private fun MetricEvent.toRecord(recordedAt: Instant) = MetricEventRecord().also {
        it.kind = kind.wire
        it.route = route
        it.valueMs = valueMs
        it.apiMs = apiMs
        it.serverMs = serverMs
        it.firstVisit = firstVisit.toFlag()
        it.layout = source.layout.wire
        it.installed = source.installed.toFlag()
        it.appVersion = source.appVersion
        it.engine = source.platform.engine.wire
        it.os = source.platform.os.wire
        it.recordedAt = recordedAt.toString()
    }

    private fun MetricEventRecord.toDomain() = MetricEvent(
        kind = MetricKind.of(kind),
        route = route,
        valueMs = valueMs,
        apiMs = apiMs,
        serverMs = serverMs,
        firstVisit = firstVisit.isFlagSet(),
        source = MetricSource(
            MetricLayout.of(layout),
            installed.isFlagSet(),
            appVersion,
            Platform(BrowserEngine.of(engine), OperatingSystem.of(os)),
        ),
    )
}
