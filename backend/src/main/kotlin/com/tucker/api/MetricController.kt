package com.tucker.api

import com.tucker.domain.MetricBatch
import com.tucker.domain.MetricEvent
import com.tucker.domain.MetricKind
import com.tucker.domain.MetricLayout
import com.tucker.domain.MetricSource
import com.tucker.persistence.MetricEventRepository
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.Clock

/** One measurement as a browser sends it. */
data class MetricEventRequest(
    val kind: MetricKind,
    val route: String,
    val valueMs: Int,
    val layout: MetricLayout,
    val installed: Boolean,
    val appVersion: String,
) {
    fun toDomain() = MetricEvent(kind, route, valueMs, MetricSource(layout, installed, appVersion))
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
    @Transactional
    fun record(@RequestBody batch: MetricBatchRequest) {
        metrics.insert(batch.toDomain(), recordedAt = clock.instant())
    }
}
