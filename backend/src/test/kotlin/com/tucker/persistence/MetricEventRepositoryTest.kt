package com.tucker.persistence

import com.tucker.domain.MetricBatch
import com.tucker.domain.MetricEvent
import com.tucker.domain.MetricKind
import com.tucker.domain.MetricLayout
import com.tucker.domain.MetricSource
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import kotlin.test.assertEquals

/** Where a metric was measured is stored with it, not only what it measured (ADR 0038). */
@SpringBootTest
@Transactional
class MetricEventRepositoryTest {

    @Autowired lateinit var metrics: MetricEventRepository

    @Test
    fun `reads an event back as it was stored, where it was measured included`() {
        val installed = MetricEvent(
            kind = MetricKind.ROUTE_CHANGE,
            route = "/review",
            valueMs = 480,
            source = MetricSource(MetricLayout.DESKTOP, installed = true, appVersion = "0.1.42"),
        )
        val inBrowser = installed.copy(
            route = "/foods",
            source = MetricSource(MetricLayout.PHONE, installed = false, appVersion = "0.1.43"),
        )

        metrics.insert(MetricBatch(listOf(installed, inBrowser)), recordedAt = Instant.parse("2026-10-21T08:00:00Z"))

        assertEquals(setOf(installed, inBrowser), metrics.findAll().toSet())
    }
}
