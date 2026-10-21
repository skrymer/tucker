package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertFailsWith

/** What one send may carry (ADR 0038): refused whole, never in part. */
class MetricBatchTest {

    @Test
    fun `refuses an empty batch`() {
        assertFailsWith<IllegalArgumentException> { MetricBatch(emptyList()) }
    }

    @Test
    fun `refuses more than 50 events`() {
        assertFailsWith<IllegalArgumentException> { MetricBatch(List(51) { event }) }
    }

    private val event = MetricEvent(
        kind = MetricKind.ROUTE_CHANGE,
        route = "/review",
        valueMs = 420,
        source = MetricSource(layout = MetricLayout.PHONE, installed = false, appVersion = "1.4.0"),
    )
}
