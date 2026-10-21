package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertFailsWith

/** One measurement a browser sends (ADR 0038): each rule refuses on its own. */
class MetricEventTest {

    @Test
    fun `refuses an unknown kind`() {
        assertFailsWith<IllegalArgumentException> { MetricKind.of("cls") }
    }

    /** A URL, not a template: an id or a query string must never be stored. */
    @Test
    fun `refuses a route that is not a route template`() {
        assertFailsWith<IllegalArgumentException> { event(route = "/foods/206?tag=3") }
    }

    @Test
    fun `refuses a negative time`() {
        assertFailsWith<IllegalArgumentException> { event(valueMs = -1) }
    }

    @Test
    fun `refuses a time over a minute`() {
        assertFailsWith<IllegalArgumentException> { event(valueMs = 60_001) }
    }

    @Test
    fun `refuses a layout that is neither phone nor desktop`() {
        assertFailsWith<IllegalArgumentException> { MetricLayout.of("tablet") }
    }

    @Test
    fun `refuses an app version longer than 40 characters`() {
        assertFailsWith<IllegalArgumentException> { source(appVersion = "1.4.".padEnd(41, '0')) }
    }

    private fun event(route: String = "/review", valueMs: Int = 420) = MetricEvent(
        kind = MetricKind.ROUTE_CHANGE,
        route = route,
        valueMs = valueMs,
        source = source(),
    )

    private fun source(appVersion: String = "1.4.0") =
        MetricSource(layout = MetricLayout.PHONE, installed = false, appVersion = appVersion)
}
