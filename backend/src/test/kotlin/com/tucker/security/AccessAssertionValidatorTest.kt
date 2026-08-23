package com.tucker.security

import org.junit.jupiter.api.Test
import org.springframework.security.oauth2.jwt.Jwt
import java.time.Instant
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * What has to be true of an assertion beyond its signature, checked against the
 * validator itself.
 *
 * [AccessGateTest] proves the same rules end-to-end over HTTP, which is the
 * guarantee that matters; this states them one at a time on the deep module, so
 * a rule that stops being enforced names itself instead of surfacing as one more
 * 401 among many.
 */
class AccessAssertionValidatorTest {

    private val properties = AccessProperties(
        issuer = AccessTokens.ISSUER,
        audience = AccessTokens.AUDIENCE,
        jwkSetUri = AccessTokens.JWK_SET_URI,
    )

    private val validator = accessAssertionValidator(properties)

    private val now: Instant = Instant.now()

    /** The assertion Cloudflare signs for a person, with one claim swapped per test. */
    private fun assertion(
        issuer: String = AccessTokens.ISSUER,
        audience: List<String>? = listOf(AccessTokens.AUDIENCE),
        email: Any? = AccessTokens.EMAIL,
        expiresAt: Instant? = now.plusSeconds(60),
    ): Jwt = Jwt.withTokenValue("assertion")
        .header("alg", "RS256")
        .issuer(issuer)
        .issuedAt(now.minusSeconds(60))
        .apply {
            audience?.let { audience(it) }
            email?.let { claim(EMAIL_CLAIM, it) }
            expiresAt?.let { expiresAt(it) }
        }
        .build()

    private fun rejects(jwt: Jwt) = validator.validate(jwt).hasErrors()

    @Test
    fun `accepts the assertion Cloudflare signs for an admitted person`() {
        assertFalse(rejects(assertion()), "a well-formed assertion must be accepted")
    }

    @Test
    fun `rejects an assertion minted for another Access application`() {
        // Every app behind one team is signed with the same keys, so the signature
        // check alone cannot tell them apart — only the AUD tag can.
        assertTrue(rejects(assertion(audience = listOf("some-other-app"))))
    }

    @Test
    fun `rejects an assertion carrying no audience at all`() {
        assertTrue(rejects(assertion(audience = null)))
    }

    @Test
    fun `rejects an assertion minted by another Access team`() {
        assertTrue(rejects(assertion(issuer = "https://someone-else.cloudflareaccess.com")))
    }

    @Test
    fun `rejects a service token, which names a machine rather than a person`() {
        // Cloudflare mints these with `common_name` where a person's assertion
        // carries `email`. A User is a person who owns rows (ADR 0021), so a
        // nameless caller has nothing to be.
        assertTrue(rejects(assertion(email = null)))
    }

    @Test
    fun `rejects an assertion whose email is blank`() {
        assertTrue(rejects(assertion(email = "   ")))
    }

    @Test
    fun `rejects an assertion whose email is not a string, rather than throwing`() {
        // The claim is read as Any?, because a declared String? compiles to an
        // unchecked cast that throws ClassCastException outside the filter chain —
        // turning a malformed token into a 500 where it should be a plain 401.
        assertTrue(rejects(assertion(email = 42)))
    }

    @Test
    fun `rejects an assertion that simply omits its expiry`() {
        // The stock timestamp validator checks `exp` only when it is there, so an
        // assertion without one would otherwise be accepted forever.
        assertTrue(rejects(assertion(expiresAt = null)))
    }
}
