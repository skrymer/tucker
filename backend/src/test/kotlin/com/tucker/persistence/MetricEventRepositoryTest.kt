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
            apiMs = 310,
            serverMs = 95,
            firstVisit = true,
            source = MetricSource(
                MetricLayout.DESKTOP,
                installed = true,
                appVersion = "0.1.42",
                platform = Platform(BrowserEngine.BLINK, OperatingSystem.WINDOWS),
            ),
        )
        val inBrowser = installed.copy(
            route = "/foods",
            firstVisit = false,
            source = MetricSource(
                MetricLayout.PHONE,
                installed = false,
                appVersion = "0.1.43",
                platform = Platform(BrowserEngine.WEBKIT, OperatingSystem.IOS),
            ),
        )

        metrics.insert(MetricBatch(listOf(installed, inBrowser)), recordedAt = Instant.parse("2026-10-21T08:00:00Z"))

        assertEquals(setOf(installed, inBrowser), metrics.find(MetricFilter(Instant.EPOCH, null, null, null)).toSet())
    }

    // An Instant's own text drops trailing zero groups, so ".123456Z" sorts before ".123Z".
    @Test
    fun `finds an event recorded a fraction of a millisecond after the range begins`() {
        val event = MetricEvent(
            kind = MetricKind.ROUTE_CHANGE,
            route = "/review",
            valueMs = 480,
            apiMs = 310,
            serverMs = 95,
            firstVisit = false,
            source = MetricSource(
                MetricLayout.DESKTOP,
                installed = false,
                appVersion = "0.1.42",
                platform = Platform(BrowserEngine.BLINK, OperatingSystem.WINDOWS),
            ),
        )

        metrics.insert(MetricBatch(listOf(event)), recordedAt = Instant.parse("2026-10-22T09:30:00.123456Z"))

        assertEquals(
            listOf(event),
            metrics.find(MetricFilter(Instant.parse("2026-10-22T09:30:00.123Z"), null, null, null)),
        )
    }
}
