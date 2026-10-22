package com.tucker.api

import com.fasterxml.jackson.annotation.JsonSetter
import com.fasterxml.jackson.annotation.Nulls
import com.tucker.domain.MetricBatch
import com.tucker.domain.MetricEvent
import com.tucker.domain.MetricKind
import com.tucker.domain.MetricLayout
import com.tucker.domain.MetricSource
import com.tucker.domain.Platform
import com.tucker.persistence.MetricEventRepository
import io.swagger.v3.oas.annotations.Parameter
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.Clock

/**
 * One measurement as a browser sends it. A null time, first-visit or installed flag is
 * refused rather than read as 0 ms or `false`, which is what a primitive would
 * otherwise default to: a time the browser failed to take (NaN serialises as null)
 * is no measurement at all.
 */
data class MetricEventRequest(
    val kind: MetricKind,
    val route: String,
    @param:JsonSetter(nulls = Nulls.FAIL) val valueMs: Int,
    @param:JsonSetter(nulls = Nulls.FAIL) val apiMs: Int,
    @param:JsonSetter(nulls = Nulls.FAIL) val serverMs: Int,
    @param:JsonSetter(nulls = Nulls.FAIL) val firstVisit: Boolean,
    val layout: MetricLayout,
    @param:JsonSetter(nulls = Nulls.FAIL) val installed: Boolean,
    val appVersion: String,
) {
    fun toDomain(platform: Platform) = MetricEvent(
        kind,
        route,
        valueMs,
        apiMs,
        serverMs,
        firstVisit,
        MetricSource(layout, installed, appVersion, platform),
    )
}

data class MetricBatchRequest(val events: List<MetricEventRequest>) {
    fun toDomain(platform: Platform) = MetricBatch(events.map { it.toDomain(platform) })
}

/** Where a browser sends what it measured of Tucker itself (ADR 0038). */
@RestController
@RequestMapping("/api/metrics")
class MetricController(private val metrics: MetricEventRepository, private val clock: Clock) {

    @PostMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    fun record(
        @RequestBody batch: MetricBatchRequest,
        @Parameter(hidden = true) @RequestHeader(HttpHeaders.USER_AGENT, required = false) userAgent: String?,
    ) {
        metrics.insert(batch.toDomain(Platform.of(userAgent.orEmpty())), recordedAt = clock.instant())
    }
}
