package com.tucker.api

import com.tucker.domain.MetricBatch
import com.tucker.domain.MetricEvent
import com.tucker.domain.MetricKind
import com.tucker.domain.MetricLayout
import com.tucker.domain.MetricSource
import com.tucker.persistence.MetricEventRepository
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.Clock

/** One measurement as a browser sends it, its kind and layout under their wire names. */
data class MetricEventRequest(
    val kind: String,
    val route: String,
    val valueMs: Int,
    val layout: String,
    val installed: Boolean,
    val appVersion: String,
) {
    fun toDomain() = MetricEvent(
        kind = MetricKind.of(kind),
        route = route,
        valueMs = valueMs,
        source = MetricSource(MetricLayout.of(layout), installed, appVersion),
    )
}

data class MetricBatchRequest(val events: List<MetricEventRequest>) {
    fun toDomain() = MetricBatch(events.map { it.toDomain() })
}

/** Where a browser sends what it measured of Tucker itself (ADR 0038). */
@RestController
@RequestMapping("/api/metrics")
class MetricController(private val metrics: MetricEventRepository, private val clock: Clock) {

    @PostMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun record(@RequestBody batch: MetricBatchRequest) {
        metrics.insert(batch.toDomain(), recordedAt = clock.instant())
    }
}
