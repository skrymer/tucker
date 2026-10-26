package com.tucker.service

import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.concurrent.Executors
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MetricRateCapTest {

    private val noon = Instant.parse("2026-10-26T12:00:00Z")

    @Test
    fun `admits the 600th event in an hour and refuses the 601st`() {
        val cap = MetricRateCap()

        assertTrue(cap.admit(userId = 1, events = 599, at = noon))
        assertTrue(cap.admit(userId = 1, events = 1, at = noon.plusSeconds(60)))
        assertFalse(cap.admit(userId = 1, events = 1, at = noon.plusSeconds(120)))
    }

    @Test
    fun `admits again once the events it counted are an hour old`() {
        val cap = MetricRateCap()
        cap.admit(userId = 1, events = 600, at = noon)

        assertFalse(cap.admit(userId = 1, events = 1, at = noon.plus(Duration.ofHours(1)).minusMillis(1)))
        assertTrue(cap.admit(userId = 1, events = 1, at = noon.plus(Duration.ofHours(1))))
    }

    @Test
    fun `forgets every admission an hour old at once, and keeps the ones still inside the hour`() {
        val cap = MetricRateCap()
        cap.admit(userId = 1, events = 200, at = noon)
        cap.admit(userId = 1, events = 200, at = noon.plus(Duration.ofMinutes(1)))
        cap.admit(userId = 1, events = 200, at = noon.plus(Duration.ofMinutes(30)))
        val later = noon.plus(Duration.ofMinutes(62))

        assertTrue(cap.admit(userId = 1, events = 400, at = later))
        assertFalse(cap.admit(userId = 1, events = 1, at = later))
    }

    @Test
    fun `counts each User on their own`() {
        val cap = MetricRateCap()
        cap.admit(userId = 1, events = 600, at = noon)

        assertTrue(cap.admit(userId = 2, events = 600, at = noon))
    }

    @Test
    fun `does not count a batch it refused`() {
        val cap = MetricRateCap()
        cap.admit(userId = 1, events = 550, at = noon)

        assertFalse(cap.admit(userId = 1, events = 51, at = noon))
        assertTrue(cap.admit(userId = 1, events = 50, at = noon))
    }

    @Test
    fun `admits no more than the cap when a User's batches arrive at once`() {
        val cap = MetricRateCap()
        val pool = Executors.newFixedThreadPool(16)

        val admitted = try {
            (1..5_000).map { pool.submit<Boolean> { cap.admit(userId = 1, events = 1, at = noon) } }.count { it.get() }
        } finally {
            pool.shutdown()
        }

        assertEquals(600, admitted)
    }
}
