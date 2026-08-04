package com.tucker.security

import org.junit.jupiter.api.Test
import org.springframework.core.io.DefaultResourceLoader
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Which key source is allowed to answer for which issuer.
 *
 * The committed non-production key ships inside the image, so `classpath:access/jwks.json`
 * is a *working* configuration in production — and a disastrous one, because anyone can
 * read the private half off GitHub. Compose's `${VAR:?}` only proves the operator set a
 * value, not that they set the right one, so the pairing is checked here instead.
 */
class AccessJwtDecoderTest {

    private val resourceLoader = DefaultResourceLoader()

    @Test
    fun `a real Cloudflare team may not be verified against a local key`() {
        val refusal = assertFailsWith<IllegalArgumentException> {
            accessJwtDecoder(
                issuer = "https://tucker.cloudflareaccess.com",
                jwkSetUri = AccessTokens.JWK_SET_URI,
                resourceLoader = resourceLoader,
            )
        }
        assertTrue(
            refusal.message!!.contains("TUCKER_ACCESS_JWK_SET_URI"),
            "the refusal must name the setting to fix, got: ${refusal.message}",
        )
    }

    @Test
    fun `a real Cloudflare team verified against its own JWKS is accepted`() {
        val decoder = accessJwtDecoder(
            issuer = "https://tucker.cloudflareaccess.com",
            jwkSetUri = "https://tucker.cloudflareaccess.com/cdn-cgi/access/certs",
            resourceLoader = resourceLoader,
        )

        // Building it must not reach the network — Nimbus fetches lazily, on first decode —
        // or a cold start with no egress would fail before serving anything.
        assertNotNull(decoder)
    }

    @Test
    fun `the local key really does verify what the non-production key signs`() {
        val decoder = accessJwtDecoder(
            issuer = AccessTokens.ISSUER,
            jwkSetUri = AccessTokens.JWK_SET_URI,
            resourceLoader = resourceLoader,
        )

        // Not merely "did not throw": decode a real assertion, so this fails if the two
        // committed halves ever stop being a matched pair.
        val decoded = decoder.decode(AccessTokens.mint())

        assertEquals(AccessTokens.EMAIL, decoded.getClaimAsString(EMAIL_CLAIM))
        assertEquals(AccessTokens.ISSUER, decoded.issuer.toString())
    }
}
