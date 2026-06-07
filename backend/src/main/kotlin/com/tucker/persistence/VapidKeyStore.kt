package com.tucker.persistence

import com.tucker.jooq.Tables.APP_CONFIG
import jakarta.annotation.PostConstruct
import org.jooq.DSLContext
import org.springframework.stereotype.Component
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.Base64

/**
 * The self-bootstrapping home of Tucker's single VAPID keypair (ADR 0012): on
 * first boot it generates a P-256 keypair and persists it in the SQLite
 * `app_config` store; on every later boot it reuses the stored one, so the key
 * the browser subscribes against is stable across reboots and host moves (it
 * rides in the Litestream backup). No external secret store.
 *
 * The public half is exposed as the base64url uncompressed EC point a browser
 * `PushManager` takes as its `applicationServerKey`; the private half is kept
 * (PKCS#8) for the reminder sender to sign with in a later slice.
 */
@Component
class VapidKeyStore(private val dsl: DSLContext) {

    @PostConstruct
    fun ensureKeypair() {
        if (read(PUBLIC_KEY) == null) generateAndStore()
    }

    /** The base64url uncompressed P-256 point — the browser's applicationServerKey. */
    fun publicKeyBase64(): String = read(PUBLIC_KEY) ?: generateAndStore().first

    /** The base64 PKCS#8 private key — used by the reminder sender to sign pushes. */
    fun privateKeyPkcs8Base64(): String = read(PRIVATE_KEY) ?: generateAndStore().second

    private fun generateAndStore(): Pair<String, String> {
        val keyPair = KeyPairGenerator.getInstance("EC").apply {
            initialize(ECGenParameterSpec("secp256r1"))
        }.generateKeyPair()

        val publicBase64 = encodeUncompressedPoint(keyPair.public as ECPublicKey)
        val privateBase64 = Base64.getEncoder().encodeToString(keyPair.private.encoded)

        // INSERT-if-absent then read back: should two boots race, both end up on
        // whichever keypair won, never two different keys.
        putIfAbsent(PUBLIC_KEY, publicBase64)
        putIfAbsent(PRIVATE_KEY, privateBase64)
        return read(PUBLIC_KEY)!! to read(PRIVATE_KEY)!!
    }

    private fun read(key: String): String? =
        dsl.select(APP_CONFIG.CONFIG_VALUE)
            .from(APP_CONFIG)
            .where(APP_CONFIG.CONFIG_KEY.eq(key))
            .fetchOne(APP_CONFIG.CONFIG_VALUE)

    private fun putIfAbsent(key: String, value: String) {
        dsl.insertInto(APP_CONFIG)
            .set(APP_CONFIG.CONFIG_KEY, key)
            .set(APP_CONFIG.CONFIG_VALUE, value)
            .onConflictDoNothing()
            .execute()
    }

    /** 0x04 ‖ X(32) ‖ Y(32), base64url without padding — the Web Push key format. */
    private fun encodeUncompressedPoint(key: ECPublicKey): String {
        val point = byteArrayOf(UNCOMPRESSED_TAG) +
            key.w.affineX.toFixedLength(COORDINATE_BYTES) +
            key.w.affineY.toFixedLength(COORDINATE_BYTES)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(point)
    }

    /** A coordinate as a fixed-width big-endian byte array (drop sign byte, left-pad). */
    private fun BigInteger.toFixedLength(length: Int): ByteArray {
        val raw = toByteArray()
        val trimmed = if (raw.size > length) raw.copyOfRange(raw.size - length, raw.size) else raw
        return ByteArray(length - trimmed.size) + trimmed
    }

    private companion object {
        const val PUBLIC_KEY = "vapid_public_key"
        const val PRIVATE_KEY = "vapid_private_key"
        const val UNCOMPRESSED_TAG = 0x04.toByte()
        const val COORDINATE_BYTES = 32
    }
}
