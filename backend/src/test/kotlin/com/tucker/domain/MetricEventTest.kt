package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
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
        assertFailsWith<IllegalArgumentException> { event.copy(route = "/foods/206?tag=3") }
    }

    @Test
    fun `accepts a time of zero`() {
        assertEquals(0, event.copy(valueMs = 0, apiMs = 0, serverMs = 0).valueMs)
    }

    @Test
    fun `refuses a negative time`() {
        val refused = assertFailsWith<IllegalArgumentException> { event.copy(valueMs = -1, apiMs = 0, serverMs = 0) }
        assertEquals("a metric's time must be 0–60000 ms, not -1", refused.message)
    }

    @Test
    fun `accepts a time of exactly a minute`() {
        assertEquals(60_000, event.copy(valueMs = 60_000).valueMs)
    }

    @Test
    fun `refuses a time over a minute`() {
        assertFailsWith<IllegalArgumentException> { event.copy(valueMs = 60_001) }
    }

    @Test
    fun `refuses a layout that is neither phone nor desktop`() {
        assertFailsWith<IllegalArgumentException> { MetricLayout.of("tablet") }
    }

    @Test
    fun `accepts an app version of exactly 40 characters`() {
        val version = "1.4.".padEnd(40, '0')

        assertEquals(version, source(appVersion = version).appVersion)
    }

    @Test
    fun `refuses an app version longer than 40 characters`() {
        assertFailsWith<IllegalArgumentException> { source(appVersion = "1.4.".padEnd(41, '0')) }
    }

    /** The server's work is part of the wait for it, never more than the wait. */
    @Test
    fun `refuses a server time longer than the api wait`() {
        assertFailsWith<IllegalArgumentException> { event.copy(apiMs = 300, serverMs = 301) }
    }

    @Test
    fun `refuses an api wait longer than the move it was part of`() {
        assertFailsWith<IllegalArgumentException> { event.copy(valueMs = 420, apiMs = 421) }
    }

    /** With server ≤ api ≤ move, this is all that keeps the api wait from going negative too. */
    @Test
    fun `refuses a negative server time`() {
        assertFailsWith<IllegalArgumentException> { event.copy(apiMs = 0, serverMs = -1) }
    }

    private val event = MetricEvent(
        kind = MetricKind.ROUTE_CHANGE,
        route = "/review",
        valueMs = 420,
        apiMs = 300,
        serverMs = 120,
        firstVisit = false,
        source = source(),
    )

    private fun source(appVersion: String = "1.4.0") =
        MetricSource(layout = MetricLayout.PHONE, installed = false, appVersion = appVersion)
}
