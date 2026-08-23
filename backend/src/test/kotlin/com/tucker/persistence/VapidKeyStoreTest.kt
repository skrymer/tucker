package com.tucker.persistence

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.security.KeyFactory
import java.security.spec.PKCS8EncodedKeySpec
import java.util.Base64
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@SpringBootTest
@Transactional
class VapidKeyStoreTest {

    @Autowired lateinit var dsl: org.jooq.DSLContext

    @Test
    fun `bootstraps a P-256 public key the browser can use as an application server key`() {
        val store = VapidKeyStore(dsl)

        val publicKey = store.publicKeyBase64()

        // A VAPID applicationServerKey is the raw uncompressed EC point: a 0x04
        // tag followed by the 32-byte X and Y coordinates — 65 bytes, base64url.
        val decoded = Base64.getUrlDecoder().decode(publicKey)
        assertEquals(65, decoded.size, "uncompressed P-256 point is 65 bytes")
        assertEquals(0x04.toByte(), decoded[0], "uncompressed-point tag")
    }

    @Test
    fun `bootstraps a private key the sender can actually sign a push with`() {
        // The half nothing on the wire ever shows. An empty or unusable one breaks
        // every reminder silently — the send fails, and the only symptom is a nudge
        // that never arrives.
        val encoded = Base64.getDecoder().decode(VapidKeyStore(dsl).privateKeyPkcs8Base64())

        val key = KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(encoded))

        assertEquals("PKCS#8", key.format)
        assertEquals("EC", key.algorithm)
    }

    @Test
    fun `returns the same keypair across instances, so it survives a reboot`() {
        val first = VapidKeyStore(dsl).publicKeyBase64()
        val second = VapidKeyStore(dsl).publicKeyBase64()

        assertTrue(first.isNotBlank())
        assertEquals(first, second, "a second boot must reuse the persisted key, not regenerate")
    }
}
