package com.tucker.domain

import org.junit.jupiter.api.Test
import java.security.NoSuchProviderException
import java.security.ProviderException
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

    @Test
    fun `a subscription whose keys will not decode is gone, not retryable`() {
        // What the transport actually throws for a p256dh that is not a curve point.
        // Nothing about the device will ever make those bytes decodable, so retrying
        // it every eligible tick forever is the wrong answer — prune it.
        val undecodable = IllegalArgumentException("Invalid point encoding 0x61")

        assertEquals(SendResult.GONE, SendResult.fromKeyFailure(undecodable))
    }

    @Test
    fun `a crypto provider that has gone missing is a transient failure`() {
        // This one is Tucker's problem, not the device's, and it would fail identically
        // for every subscription — reading it as "gone" would prune the lot.
        val noProvider = NoSuchProviderException("no such provider: BC")

        assertEquals(SendResult.FAILED, SendResult.fromKeyFailure(noProvider))
    }

    @Test
    fun `a crypto provider that fails internally is transient, unchecked though it is`() {
        // ProviderException is the one java.security failure that is unchecked, so
        // "the environment broke" and "these bytes are rubbish" are not separable by
        // checked-ness alone. It is still the environment, and still every device.
        val providerBroke = ProviderException("BC internal error")

        assertEquals(SendResult.FAILED, SendResult.fromKeyFailure(providerBroke))
    }

    @Test
    fun `a failure of a kind we do not recognise leaves the subscription alone`() {
        // What a library upgrade throws that this rule has never seen. The two
        // mistakes are not symmetric: retrying a device that is really dead costs one
        // request an hour, while pruning one that is really fine costs the user their
        // reminders with nothing on screen to explain it and no way back but
        // re-enabling on that device. So the unknown case takes the recoverable side.
        val unheardOf = Exception("some future transport's idea of a bad day")

        assertEquals(SendResult.FAILED, SendResult.fromKeyFailure(unheardOf))
    }
}
