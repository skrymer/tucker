package com.tucker.service

import com.tucker.domain.MetricRange
import com.tucker.persistence.MetricEventRepository
import org.springframework.stereotype.Service
import java.time.Instant

/**
 * Keeps the metric store bounded (ADR 0038): an event is kept as far back as the
 * widest [MetricRange] reaches, 90 days, then deleted.
 */
@Service
class MetricRetention(private val metrics: MetricEventRepository) {

    fun prune(now: Instant) {
        metrics.deleteRecordedUpTo(MetricRange.QUARTER.since(now))
    }
}
