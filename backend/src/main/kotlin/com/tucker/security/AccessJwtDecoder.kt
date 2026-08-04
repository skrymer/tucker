package com.tucker.security

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.source.ImmutableJWKSet
import com.nimbusds.jose.jwk.source.JWKSourceBuilder
import com.nimbusds.jose.proc.JWSVerificationKeySelector
import com.nimbusds.jose.proc.SecurityContext
import com.nimbusds.jose.util.DefaultResourceRetriever
import com.nimbusds.jwt.proc.DefaultJWTProcessor
import org.springframework.core.io.ResourceLoader
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import java.net.URI

/**
 * Builds the one decoder every environment verifies through (ADR 0020).
 *
 * Production fetches Cloudflare's team JWKS over HTTPS; everything else reads the
 * committed non-production set off the classpath. Only the *key source* differs — the
 * signature check, the claim validators and the failure modes are the same objects either
 * way, so the path that runs in production is the path the test suite exercises.
 */
internal fun accessJwtDecoder(
    issuer: String,
    jwkSetUri: String,
    resourceLoader: ResourceLoader,
): NimbusJwtDecoder {
    val remote = jwkSetUri.startsWith("http://") || jwkSetUri.startsWith("https://")
    // The committed non-production key ships *inside the image*, so pointing production at
    // `classpath:access/jwks.json` is a configuration that boots, passes every health
    // check, and silently trusts a private key that anyone can read off GitHub. Compose's
    // `${VAR:?}` proves only that the operator set something. Nothing else in the system
    // can tell the two apart, so refuse the one combination that is always a mistake: a
    // real Cloudflare team verified by a key we shipped ourselves.
    require(!(issuer.isCloudflareTeam() && !remote)) {
        "tucker.access.issuer is a real Cloudflare team ($issuer) but " +
            "tucker.access.jwk-set-uri is not a URL ($jwkSetUri) — that would verify " +
            "production against the committed non-production key, which is public. Set " +
            "TUCKER_ACCESS_JWK_SET_URI to <team domain>/cdn-cgi/access/certs " +
            "(deploy/README.md step 6)."
    }
    return if (remote) remoteSetDecoder(jwkSetUri) else localSetDecoder(jwkSetUri, resourceLoader)
}

private fun String.isCloudflareTeam(): Boolean =
    removeSuffix("/").endsWith(".cloudflareaccess.com")

/**
 * Bounds what an unrecognised `kid` can cost.
 *
 * Nimbus refreshes the key set when a token names a `kid` it has not cached, and that
 * happens **inline on the request thread, before the signature is checked** — so it is
 * reachable with a token that is pure garbage apart from its header. Spring's stock wiring
 * makes that as expensive as it can be: a bare `RestTemplate` with no timeouts, and the
 * deprecated `RemoteJWKSet`, which has no negative cache and so refetches on *every* such
 * request. Two independent bounds, because they fail differently:
 *
 * - timeouts, so one hanging fetch cannot park a Tomcat thread for ever (issue #193);
 * - a rate limit, so N junk tokens cannot become N outbound requests to Cloudflare.
 *
 * `outageTolerant` then keeps serving the cached keys through a brief Cloudflare wobble
 * rather than 401-ing everyone, which is the failure ADR 0020 flags as the cost of
 * depending on their JWKS at all.
 */
private fun remoteSetDecoder(jwkSetUri: String): NimbusJwtDecoder {
    val retriever = DefaultResourceRetriever(
        JWKS_CONNECT_TIMEOUT_MILLIS,
        JWKS_READ_TIMEOUT_MILLIS,
    )
    val keys = JWKSourceBuilder.create<SecurityContext>(URI(jwkSetUri).toURL(), retriever)
        .rateLimited(JWKS_MIN_REFRESH_INTERVAL_MILLIS)
        .refreshAheadCache(true)
        .outageTolerant(true)
        .build()
    val processor = DefaultJWTProcessor<SecurityContext>().apply {
        jwsKeySelector = JWSVerificationKeySelector(JWSAlgorithm.RS256, keys)
        setJWTClaimsSetVerifier { _, _ -> }
    }
    return NimbusJwtDecoder(processor)
}

private fun localSetDecoder(location: String, resourceLoader: ResourceLoader): NimbusJwtDecoder {
    val keys = resourceLoader.getResource(location).inputStream
        .use { JWKSet.parse(it.readBytes().decodeToString()) }
    val processor = DefaultJWTProcessor<SecurityContext>().apply {
        jwsKeySelector = JWSVerificationKeySelector(JWSAlgorithm.RS256, ImmutableJWKSet(keys))
        // Claims are Spring's job, not Nimbus's — the same division `withJwkSetUri` makes,
        // so a rejected claim surfaces identically in both environments.
        setJWTClaimsSetVerifier { _, _ -> }
    }
    return NimbusJwtDecoder(processor)
}

// The same order of magnitude as the Open Food Facts budget in `application.yml` — long
// enough for a cold TLS handshake to Cloudflare, short enough that a hung endpoint frees
// the thread while the browser is still waiting.
private const val JWKS_CONNECT_TIMEOUT_MILLIS = 2_000
private const val JWKS_READ_TIMEOUT_MILLIS = 4_000

// Cloudflare rotates rarely, so one refetch per 30s is generous for a real rotation and
// still collapses a flood of unknown-`kid` tokens into a trickle.
private const val JWKS_MIN_REFRESH_INTERVAL_MILLIS = 30_000L
