package com.tucker.security

import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator
import org.springframework.security.oauth2.core.OAuth2TokenValidator
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtClaimNames
import org.springframework.security.oauth2.jwt.JwtClaimValidator
import org.springframework.security.oauth2.jwt.JwtValidators

/**
 * What has to be true of an assertion beyond its signature being ours.
 *
 * A signature only says Cloudflare minted it — not that it was minted for *this*
 * application, by *this* team, and is still current.
 */
internal fun accessAssertionValidator(properties: AccessProperties): OAuth2TokenValidator<Jwt> =
    DelegatingOAuth2TokenValidator(
        // Timestamps, plus the team that minted it — every Access team has its own keys,
        // so this is belt to the signature's braces rather than the only thing holding.
        JwtValidators.createDefaultWithIssuer(properties.issuer),
        mintedFor(properties.audience),
        namesAPerson(),
        expiresAtAll(),
    )

/**
 * The AUD tag identifies one Access application. Without this, an assertion for any other
 * app behind the same team would be accepted here — the team signs them all with the same
 * keys, so the signature check alone cannot tell them apart.
 */
private fun mintedFor(audience: String): OAuth2TokenValidator<Jwt> =
    JwtClaimValidator<List<String>?>(JwtClaimNames.AUD) { audience in it.orEmpty() }

/**
 * Tucker is for people. Cloudflare also mints assertions for **service tokens**, which
 * authenticate a machine and carry `common_name` where a person's carries `email` — and a
 * User is a person who owns rows (ADR 0021), so a nameless caller has nothing to be.
 * Rejecting here keeps that out of the domain rather than leaving every later slice to
 * cope with a principal that has no email.
 */
private fun namesAPerson(): OAuth2TokenValidator<Jwt> =
    // Typed `Any?`, not `String?`: JwtClaimValidator hands the raw claim to this predicate
    // with no type guard, so a declared `String?` compiles to an unchecked cast that throws
    // ClassCastException on, say, `"email": 42`. That escapes the resource-server filter
    // entirely — no handler catches it — and a malformed token becomes a 500 with a stack
    // trace where it should be a plain 401.
    JwtClaimValidator<Any?>(EMAIL_CLAIM) { it is String && it.isNotBlank() }

/**
 * The stock timestamp validator only checks `exp` *when it is there*, so an assertion that
 * simply omits it is accepted forever. Cloudflare always sets one; requiring it costs
 * nothing and means no token this backend accepts can outlive its own deadline.
 */
private fun expiresAtAll(): OAuth2TokenValidator<Jwt> =
    JwtClaimValidator<Any?>(JwtClaimNames.EXP) { it != null }
