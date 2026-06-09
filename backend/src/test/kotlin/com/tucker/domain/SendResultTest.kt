package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class SendResultTest {

    @Test
    fun `a 201 Created counts as delivered`() {
        assertEquals(SendResult.DELIVERED, SendResult.fromStatusCode(201))
    }

    @Test
    fun `a 410 Gone marks the subscription gone`() {
        assertEquals(SendResult.GONE, SendResult.fromStatusCode(410))
    }

    @Test
    fun `a 404 Not Found marks the subscription gone`() {
        assertEquals(SendResult.GONE, SendResult.fromStatusCode(404))
    }

    @Test
    fun `other 2xx success codes count as delivered`() {
        assertEquals(SendResult.DELIVERED, SendResult.fromStatusCode(200))
        assertEquals(SendResult.DELIVERED, SendResult.fromStatusCode(204))
    }

    @Test
    fun `a 5xx server error counts as a transient failure`() {
        assertEquals(SendResult.FAILED, SendResult.fromStatusCode(500))
    }
}
