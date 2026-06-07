package com.tucker.api

import com.tucker.persistence.PushSubscriptionRepository
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
import kotlin.test.assertTrue

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
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
