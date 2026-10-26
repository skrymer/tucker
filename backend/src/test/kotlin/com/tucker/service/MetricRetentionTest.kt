package com.tucker.service

import com.tucker.domain.BrowserEngine
import com.tucker.domain.MetricBatch
import com.tucker.domain.MetricFilter
import com.tucker.domain.MetricLayout
import com.tucker.domain.MetricSource
import com.tucker.domain.OperatingSystem
import com.tucker.domain.Platform
import com.tucker.domain.WebVital
import com.tucker.domain.VitalKind
import com.tucker.persistence.MetricEventRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Metric events are kept 90 days (ADR 0038). */
@SpringBootTest
@Transactional
class MetricRetentionTest {

    @Autowired lateinit var metrics: MetricEventRepository

    @Autowired lateinit var retention: MetricRetention

    private val now = Instant.parse("2026-10-26T03:00:00Z")

    @Test
    fun `deletes an event 90 days old and keeps one 89 days old`() {
        val old = vital(route = "/retention-90-days")
        val kept = vital(route = "/retention-89-days")
        metrics.insert(MetricBatch(listOf(old)), recordedAt = now.minus(Duration.ofDays(90)))
        metrics.insert(MetricBatch(listOf(kept)), recordedAt = now.minus(Duration.ofDays(89)))

        retention.prune(now)

        val left = metrics.find(MetricFilter(Instant.EPOCH, null, null, null))
        assertFalse(old in left)
        assertTrue(kept in left)
    }

    private fun vital(route: String) = WebVital(
        VitalKind.LCP,
        route = route,
        valueMs = 1_840,
        source = MetricSource(
            MetricLayout.PHONE,
            installed = false,
            appVersion = "0.1.42",
            platform = Platform(BrowserEngine.WEBKIT, OperatingSystem.IOS),
        ),
    )
}
