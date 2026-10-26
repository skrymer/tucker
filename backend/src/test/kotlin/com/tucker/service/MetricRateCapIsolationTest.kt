package com.tucker.service

import org.junit.jupiter.api.MethodOrderer
import org.junit.jupiter.api.Order
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestMethodOrder
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import java.time.Instant
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Every test starts with nothing counted against any User. A User provisioned in a
 * rolled-back test leaves its id to the next one, and the cap bean outlives the
 * rollback, so without this a test inherits whatever an earlier one sent.
 */
@SpringBootTest
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
class MetricRateCapIsolationTest {

    @Autowired lateinit var cap: MetricRateCap

    private val now = Instant.parse("2026-10-26T12:00:00Z")

    @Test
    @Order(1)
    fun `one test leaves a User at the cap`() {
        cap.admit(userId = USER, events = 600, at = now)

        assertFalse(cap.admit(userId = USER, events = 1, at = now), "precondition: the User is at the cap")
    }

    /** Within the same hour as the test before, so only a cleared count admits this. */
    @Test
    @Order(2)
    fun `the next test finds that User with nothing counted`() {
        assertTrue(cap.admit(userId = USER, events = 1, at = now))
    }

    private companion object {
        const val USER = 9_001L
    }
}
