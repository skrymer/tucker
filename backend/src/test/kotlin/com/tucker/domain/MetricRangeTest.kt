package com.tucker.domain

import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import java.time.Instant
import kotlin.test.assertEquals

class MetricRangeTest {

    @ParameterizedTest(name = "{0} reaches back to {1}")
    @CsvSource(
        "24h, 2026-10-21T09:30:00Z",
        "7d, 2026-10-15T09:30:00Z",
        "30d, 2026-09-22T09:30:00Z",
        "90d, 2026-07-24T09:30:00Z",
    )
    fun `each range reaches back its own length from now`(wire: String, since: String) {
        val now = Instant.parse("2026-10-22T09:30:00Z")

        assertEquals(Instant.parse(since), MetricRange.of(wire).since(now))
    }
}
