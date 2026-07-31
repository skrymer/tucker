package com.tucker.persistence

import com.sun.net.httpserver.HttpServer
import com.tucker.domain.PushSubscription
import com.tucker.domain.SendResult
import nl.martijndwars.webpush.Utils
import org.bouncycastle.jce.ECNamedCurveTable
import org.bouncycastle.jce.interfaces.ECPublicKey
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import java.lang.management.ManagementFactory
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.security.KeyPairGenerator
import java.util.Base64
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The two behaviours of the production sender that are ours rather than the push
 * service's, and so can be specified despite the external boundary (ADR 0013): a
 * subscription whose stored keys cannot be decoded is rejected before any request is
 * made, and a send that never reaches a server still releases everything it took to
 * try. What happens *across* the boundary stays untested by design — the status
 * mapping lives in `SendResultTest`, the scheduler glue in
 * `ReminderSchedulerIntegrationTest`.
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

    @Test
    fun `does not accumulate threads when the push endpoint refuses the connection`() {
        val keys = freshP256dh()

        // Warm up against a service that answers. That brings the transport up, so its
        // own threads land in the baseline rather than looking like a leak — but mainly
        // it proves the send really reaches the wire: DELIVERED can only come from a
        // status code. A refused send cannot show that, since it answers FAILED whether
        // it opened a socket or never got past encrypting, and a send that never opens
        // one leaks nothing even on the broken transport this test exists to catch.
        val accepting = acceptingService()
        try {
            val reachable = PushSubscription(null, "http://127.0.0.1:${accepting.address.port}/d", keys, AUTH)
            assertEquals(SendResult.DELIVERED, sender.send(reachable, "{}"))
        } finally {
            accepting.stop(0)
        }

        val device = PushSubscription(null, "http://127.0.0.1:${refusingPort()}/device", keys, AUTH)
        val baseline = liveThreads()

        repeat(SENDS) { assertEquals(SendResult.FAILED, sender.send(device, "{}")) }

        val leaked = liveThreads() - baseline
        assertTrue(
            leaked <= ALLOWANCE,
            "$SENDS refused sends left $leaked extra threads alive; a transport built per send " +
                "leaks one I/O reactor each, so this should be about zero.",
        )
    }

    /** A port nothing listens on: bound only to learn it is free, then given back. */
    private fun refusingPort(): Int = ServerSocket(0).use { it.localPort }

    /** A stand-in push service that accepts anything, the way a real one answers a push. */
    private fun acceptingService(): HttpServer = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        createContext("/") { exchange ->
            exchange.sendResponseHeaders(201, -1)
            exchange.close()
        }
        start()
    }

    private fun liveThreads(): Int = ManagementFactory.getThreadMXBean().threadCount

    /** A p256dh the transport will actually encrypt to, so the send reaches the socket. */
    private fun freshP256dh(): String {
        val keys = KeyPairGenerator.getInstance("ECDH", BouncyCastleProvider.PROVIDER_NAME).apply {
            initialize(ECNamedCurveTable.getParameterSpec("prime256v1"))
        }.generateKeyPair()
        return Base64.getUrlEncoder().withoutPadding().encodeToString(Utils.encode(keys.public as ECPublicKey))
    }

    private companion object {
        /** 16 bytes, base64url — the length a Web Push auth secret is defined to be. */
        const val AUTH = "dHVja2VyLXRlc3QtYXV0aA"

        const val SENDS = 10

        /**
         * Room for unrelated JVM threads (JIT, GC) to come and go, and still well under
         * the leak: a reactor per send is `availableProcessors + 1` threads each, so
         * even a single-core runner lands at 20 here, and this box at 150.
         */
        const val ALLOWANCE = 8
    }
}
