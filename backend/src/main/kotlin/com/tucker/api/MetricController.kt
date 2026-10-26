package com.tucker.api

import com.fasterxml.jackson.annotation.JsonSetter
import com.fasterxml.jackson.annotation.Nulls
import com.tucker.domain.MetricBatch
import com.tucker.domain.MetricEvent
import com.tucker.domain.MetricKind
import com.tucker.domain.MetricLayout
import com.tucker.domain.MetricSource
import com.tucker.domain.Platform
import com.tucker.domain.RouteChange
import com.tucker.domain.VitalKind
import com.tucker.domain.WebVital
import com.tucker.domain.MetricRateCap
import com.tucker.persistence.MetricEventRepository
import com.tucker.security.CurrentUser
import io.swagger.v3.oas.annotations.Parameter
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.time.Clock

/**
 * One measurement as a browser sends it. A null time or installed flag is refused
 * rather than read as 0 ms or `false`, which is what a primitive would otherwise
 * default to: a time the browser failed to take (NaN serialises as null) is no
 * measurement at all. [apiMs], [serverMs] and [firstVisit] belong to a route change,
 * which must carry all three.
 */
data class MetricEventRequest(
    val kind: MetricKind,
    val route: String,
    @param:JsonSetter(nulls = Nulls.FAIL) val valueMs: Int,
    val apiMs: Int?,
    val serverMs: Int?,
    val firstVisit: Boolean?,
    val layout: MetricLayout,
    @param:JsonSetter(nulls = Nulls.FAIL) val installed: Boolean,
    val appVersion: String,
) {
    fun toDomain(platform: Platform): MetricEvent {
        val source = MetricSource(layout, installed, appVersion, platform)
        return when (kind) {
            MetricKind.ROUTE_CHANGE -> routeChange(source)
            MetricKind.LCP -> webVital(VitalKind.LCP, source)
            MetricKind.INP -> webVital(VitalKind.INP, source)
        }
    }

    private fun routeChange(source: MetricSource) = RouteChange(
        route,
        valueMs,
        requireNotNull(apiMs) { "a route change must say how long it waited on the api" },
        requireNotNull(serverMs) { "a route change must say how long the server worked" },
        requireNotNull(firstVisit) { "a route change must say whether it was the route's first visit" },
        source,
    )

    private fun webVital(vitalKind: VitalKind, source: MetricSource): WebVital {
        require(apiMs == null) { "an ${kind.wire} event carries no apiMs" }
        require(serverMs == null) { "an ${kind.wire} event carries no serverMs" }
        require(firstVisit == null) { "an ${kind.wire} event carries no firstVisit" }
        return WebVital(vitalKind, route, valueMs, source)
    }
}

data class MetricBatchRequest(val events: List<MetricEventRequest>) {
    fun toDomain(platform: Platform) = MetricBatch(events.map { it.toDomain(platform) })
}

/** Where a browser sends what it measured of Tucker itself (ADR 0038). */
@RestController
@RequestMapping("/api/metrics")
class MetricController(
    private val metrics: MetricEventRepository,
    private val cap: MetricRateCap,
    private val currentUser: CurrentUser,
    private val clock: Clock,
) {

    @PostMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    fun record(
        @RequestBody batch: MetricBatchRequest,
        @Parameter(hidden = true) @RequestHeader(HttpHeaders.USER_AGENT, required = false) userAgent: String?,
    ) {
        val events = batch.toDomain(Platform.of(userAgent.orEmpty()))
        val now = clock.instant()
        if (!cap.admit(currentUser.id, events.events.size, now)) throw OverMetricCapException()
        metrics.insert(events, recordedAt = now)
    }
}

/** A User sent more than [MetricRateCap] admits in an hour; the batch is dropped. */
class OverMetricCapException : RuntimeException("no more than ${MetricRateCap.PER_HOUR} events an hour")

/** Scoped to [MetricController], so the 429 is described on `POST /api/metrics` alone. */
@RestControllerAdvice(assignableTypes = [MetricController::class])
class MetricCapExceptionHandler {

    @ExceptionHandler(OverMetricCapException::class)
    @ResponseStatus(HttpStatus.TOO_MANY_REQUESTS)
    fun handleOverCap(e: OverMetricCapException) = ApiError(e.message ?: "too many requests")
}
