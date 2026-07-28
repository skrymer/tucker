package com.tucker.persistence

import com.tucker.domain.PushSubscription
import com.tucker.domain.SendResult
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import kotlin.test.assertEquals

/**
 * The one behaviour of the production sender that does *not* cross the external
 * boundary (ADR 0013), and so can be specified here: a subscription whose stored
 * keys cannot be decoded is rejected while building the push, before any request is
 * made. The transport itself stays untested by design — its status mapping lives in
 * `SendResultTest`, its scheduler glue in `ReminderSchedulerIntegrationTest`.
 */
@SpringBootTest
class MartijndwarsWebPushSenderTest {

    @Autowired lateinit var sender: MartijndwarsWebPushSender

    @Test
    fun `reports a subscription with undecodable keys as gone`() {
        // A real endpoint, so nothing but the keys can be the reason — and one that
        // would fail the test by hanging or erroring if a request were ever attempted.
        val corrupted = PushSubscription(null, "https://push.example/device-a", "not-a-key", "Auth")

        assertEquals(SendResult.GONE, sender.send(corrupted, "{}"))
    }
}
