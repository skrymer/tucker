package com.tucker.service

import com.tucker.persistence.MetricEventRepository
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant

/** Keeps the metric store bounded: an event is kept 90 days, then deleted (ADR 0038). */
@Service
class MetricRetention(private val metrics: MetricEventRepository) {

    fun prune(now: Instant) {
        metrics.deleteRecordedUpTo(now.minus(KEPT))
    }

    private companion object {
        val KEPT: Duration = Duration.ofDays(90)
    }
}
