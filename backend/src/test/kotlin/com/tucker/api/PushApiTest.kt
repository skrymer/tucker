package com.tucker.api

import com.tucker.persistence.PushSubscriptionRepository
import com.tucker.security.WithTuckerUser
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Signed in as a fixed User, because the assertions read [PushSubscriptionRepository]
 * back after a request and that repository is scoped (ADR 0021) — the test thread has
 * to be the same person its own requests authenticate as, or the row it just created
 * is simply not there. [WithTuckerUser] defaults to that address, which is why the
 * bare annotation is enough.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class PushApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var subscriptions: PushSubscriptionRepository

    private fun postSubscription(endpoint: String) {
        mockMvc.post("/api/push/subscriptions") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"endpoint":"$endpoint",
                          "keys":{"p256dh":"BPublicKey","auth":"AuthSecret"},
                          "label":"Pixel 7"}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `exposes the VAPID public key the browser subscribes against`() {
        mockMvc.get("/api/push/vapid-public-key").andExpect {
            status { isOk() }
            jsonPath("$.publicKey") { isNotEmpty() }
        }
    }

    @Test
    fun `POST stores a device's push subscription with its keys`() {
        postSubscription("https://push.example/device-a")

        val stored = subscriptions.findAll()
        assertEquals(1, stored.size)
        assertEquals("https://push.example/device-a", stored.single().endpoint)
        assertEquals("BPublicKey", stored.single().p256dh)
        assertEquals("AuthSecret", stored.single().auth)
        assertEquals("Pixel 7", stored.single().label)
    }

    @Test
    fun `DELETE forgets a device's subscription by its endpoint`() {
        postSubscription("https://push.example/device-a")
        postSubscription("https://push.example/device-b")

        mockMvc.delete("/api/push/subscriptions") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"endpoint":"https://push.example/device-a"}"""
        }.andExpect { status { isNoContent() } }

        val remaining = subscriptions.findAll()
        assertEquals(1, remaining.size)
        assertEquals("https://push.example/device-b", remaining.single().endpoint)
        assertTrue(remaining.none { it.endpoint == "https://push.example/device-a" })
    }

    /**
     * The stored subscription says what the browser last sent, including when what it
     * last sent was nothing. A device that re-subscribes without a label has no label —
     * keeping the old one would leave a name on a row nothing in the browser still
     * agrees with, and the label is only ever there to tell two of somebody's devices
     * apart.
     */
    @Test
    fun `re-subscribing without a label clears the one stored before`() {
        postSubscription("https://push.example/device-a")
        assertEquals("Pixel 7", subscriptions.findAll().single().label)

        mockMvc.post("/api/push/subscriptions") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"endpoint":"https://push.example/device-a",
                          "keys":{"p256dh":"BRotatedKey","auth":"RotatedSecret"}}"""
        }.andExpect { status { isCreated() } }

        assertNull(subscriptions.findAll().single().label)
    }

    @Test
    fun `re-subscribing the same device refreshes its keys without duplicating it`() {
        postSubscription("https://push.example/device-a")

        mockMvc.post("/api/push/subscriptions") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"endpoint":"https://push.example/device-a",
                          "keys":{"p256dh":"BRotatedKey","auth":"RotatedSecret"}}"""
        }.andExpect { status { isCreated() } }

        val stored = subscriptions.findAll()
        assertEquals(1, stored.size, "the same endpoint must stay one row")
        assertEquals("BRotatedKey", stored.single().p256dh)
        assertEquals("RotatedSecret", stored.single().auth)
    }
}
