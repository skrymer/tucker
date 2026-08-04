package com.tucker.security

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jose.util.Base64URL
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import java.time.Instant
import java.util.Date

/**
 * Mints the assertion Cloudflare Access would sign, using the committed non-production
 * key (`dev/access-key/`).
 *
 * Every backend test authenticates with one of these, so the suite exercises the *real*
 * decoder — signature, issuer, audience and expiry all genuinely checked — rather than a
 * post-processor that installs an already-trusted principal (ADR 0020 rejects skipping
 * verification anywhere). Each parameter defaults to what a good token carries, so a test
 * for one rejection rule names only the claim it is breaking.
 */
object AccessTokens {

    /** Matches `tucker.access.issuer` outside production; `.invalid` can never resolve. */
    const val ISSUER = "https://access.tucker.invalid"

    /** Matches `tucker.access.audience` outside production — a stand-in for the AUD tag. */
    const val AUDIENCE = "tucker-dev"

    /** Who every test is. Nothing consumes it yet — the User arrives in the next slice. */
    const val EMAIL = "tester@tucker.invalid"

    /** Where the non-production decoder is pointed, for tests that boot their own app. */
    const val JWK_SET_URI = "classpath:access/jwks.json"

    /** The committed non-production key, whose public half the decoder is pointed at. */
    private val devKey: RSAKey =
        RSAKey.parse(readResource("/access/signing-key.json"))

    /** A key the backend has never heard of, for proving an unknown signature is refused. */
    private val foreignKey: RSAKey by lazy {
        RSAKeyGenerator(2048).keyID("not-tuckers-key").generate()
    }

    fun mint(
        email: String? = EMAIL,
        issuer: String = ISSUER,
        audience: String = AUDIENCE,
        issuedAt: Instant = Instant.now(),
        signedWith: RSAKey = devKey,
    ): String = signed(
        baseClaims(issuer, audience, issuedAt)
            .apply { email?.let { claim(EMAIL_CLAIM, it) } }
            .build(),
        signedWith,
    )

    /** Everything a good assertion carries except the email, which the callers vary. */
    private fun baseClaims(
        issuer: String = ISSUER,
        audience: String = AUDIENCE,
        issuedAt: Instant = Instant.now(),
    ): JWTClaimsSet.Builder = JWTClaimsSet.Builder()
        .issuer(issuer)
        .audience(audience)
        .subject("access-subject")
        .issueTime(Date.from(issuedAt))
        .expirationTime(Date.from(issuedAt.plusSeconds(EXPIRY_SECONDS)))

    private fun signed(claims: JWTClaimsSet, signedWith: RSAKey = devKey): String {
        val header = JWSHeader.Builder(JWSAlgorithm.RS256).keyID(signedWith.keyID).build()
        return SignedJWT(header, claims)
            .apply { sign(RSASSASigner(signedWith)) }
            .serialize()
    }

    /** A token that expired an hour ago — issued back then too, so only `exp` is wrong. */
    fun expired(): String = mint(issuedAt = Instant.now().minusSeconds(EXPIRY_SECONDS + AN_HOUR))

    /** A well-formed token whose signature belongs to a key the backend does not trust. */
    fun signedByAnotherKey(): String = mint(signedWith = foreignKey)

    /**
     * `email` present but not a string. Cloudflare never sends this, but a validator that
     * casts before checking turns it into a 500 with a stack trace instead of a 401 — and
     * the day a second issuer or a changed claim shape arrives, that becomes reachable.
     */
    fun mintWithNumericEmail(): String = signed(baseClaims().claim(EMAIL_CLAIM, 42).build())

    /**
     * A token with no `exp` at all. Nothing in the stock validator chain *requires* the
     * claim — it only checks it when present — so without a rule of our own this is a
     * credential that never stops working.
     */
    fun neverExpiring(): String =
        signed(baseClaims().claim(EMAIL_CLAIM, EMAIL).expirationTime(null).build())

    /**
     * A valid token with its *payload* rewritten — the shape of an attack, where a real
     * assertion is edited to name someone else and the signature no longer matches.
     */
    fun tampered(): String {
        val (header, payload, signature) = mint().split(".")
        val forged = Base64URL.encode(
            Base64URL(payload).decodeToString().replace(EMAIL, "someone.else@tucker.invalid"),
        )
        return "$header.$forged.$signature"
    }

    private fun readResource(path: String): String =
        checkNotNull(AccessTokens::class.java.getResource(path)) {
            "$path is missing — build.gradle.kts copies it from dev/access-key/"
        }.readText()

    private const val EXPIRY_SECONDS = 600L
    private const val AN_HOUR = 3600L
}
