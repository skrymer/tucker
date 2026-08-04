package com.tucker.security

import com.nimbusds.jwt.SignedJWT
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * The fixtures the gate's rejection tests are built from.
 *
 * A negative test only means what it says if the token really is malformed in the way its
 * name claims — a `neverExpiring()` that quietly still carries an `exp` would make
 * "refused" prove nothing, and would go on passing after the rule protecting against it
 * was deleted. These are cheap, and they are what let the rejection tests be trusted.
 */
class AccessTokensTest {

    @Test
    fun `the never-expiring token carries no expiry at all`() {
        val claims = SignedJWT.parse(AccessTokens.neverExpiring()).jwtClaimsSet
        assertNull(claims.expirationTime, "exp should be absent, not merely far away")
        assertEquals(AccessTokens.EMAIL, claims.getStringClaim(EMAIL_CLAIM))
    }

    @Test
    fun `the numeric-email token carries a number where a string belongs`() {
        val claims = SignedJWT.parse(AccessTokens.mintWithNumericEmail()).jwtClaimsSet
        assertEquals(42L, claims.getClaim(EMAIL_CLAIM))
    }

    @Test
    fun `the tampered token still parses, so it is the signature that fails`() {
        val claims = SignedJWT.parse(AccessTokens.tampered()).jwtClaimsSet
        assertEquals("someone.else@tucker.invalid", claims.getStringClaim(EMAIL_CLAIM))
    }
}
