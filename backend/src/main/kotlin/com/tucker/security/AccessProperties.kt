package com.tucker.security

import jakarta.validation.constraints.NotBlank
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.validation.annotation.Validated

/**
 * What it takes to verify a Cloudflare Access assertion (ADR 0020).
 *
 * **None of these has a usable default, on purpose.** They bind to `""` only so that a
 * missing one fails as a *blank* value, which `@Validated` + `@field:NotBlank` then turns
 * into a context-refresh failure naming the property and the env var — a far better
 * diagnostic than Kotlin's "parameter specified as non-null is null". The annotations are
 * therefore load-bearing, not decorative: drop them and a backend boots happily with a
 * blank issuer.
 *
 * Refusing to start is the point. The alternative is a production deploy that forgets its
 * Access settings quietly falling back to the committed non-production key — which, being
 * in a public repository, anyone could sign with. Every non-production boot path states
 * all three explicitly: `src/test/resources/application.yml`, the `bootRun` args in
 * `build.gradle.kts`, `docker-compose.yml`, and the Testcontainers e2e.
 */
@Validated
@ConfigurationProperties("tucker.access")
data class AccessProperties(
    /** The Access team domain, e.g. `https://tucker.cloudflareaccess.com`. */
    @field:NotBlank(message = "set TUCKER_ACCESS_ISSUER — see deploy/README.md")
    val issuer: String = "",

    /** The Access application's AUD tag — one origin's worth of audience. */
    @field:NotBlank(message = "set TUCKER_ACCESS_AUDIENCE — see deploy/README.md")
    val audience: String = "",

    /**
     * Where the signing keys come from: an `https://` URL is fetched and refreshed as
     * Cloudflare rotates, anything else is read once through Spring's resource loader
     * (`classpath:access/jwks.json` outside production).
     */
    @field:NotBlank(message = "set TUCKER_ACCESS_JWK_SET_URI — see deploy/README.md")
    val jwkSetUri: String = "",
)
