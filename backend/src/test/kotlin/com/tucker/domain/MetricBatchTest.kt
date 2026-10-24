package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** What one send may carry (ADR 0038): refused whole, never in part. */
class MetricBatchTest {

    @Test
    fun `refuses an empty batch`() {
        assertFailsWith<IllegalArgumentException> { MetricBatch(emptyList()) }
    }

    @Test
    fun `accepts exactly 50 events`() {
        assertEquals(50, MetricBatch(List(50) { event }).events.size)
    }

    @Test
    fun `refuses more than 50 events`() {
        assertFailsWith<IllegalArgumentException> { MetricBatch(List(51) { event }) }
    }

    private val event = RouteChange(
        route = "/review",
        valueMs = 420,
        apiMs = 300,
        serverMs = 120,
        firstVisit = false,
        source = MetricSource(
            layout = MetricLayout.PHONE,
            installed = false,
            appVersion = "1.4.0",
            platform = Platform(BrowserEngine.WEBKIT, OperatingSystem.IOS),
        ),
    )
}
