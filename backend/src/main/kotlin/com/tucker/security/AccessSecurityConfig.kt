package com.tucker.security

import jakarta.servlet.DispatcherType
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.io.ResourceLoader
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.server.resource.web.HeaderBearerTokenResolver
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.util.matcher.DispatcherTypeRequestMatcher

/**
 * Cloudflare Access authenticates; this is where Tucker checks its work (ADR 0020).
 *
 * Every request carries Access's signed assertion, and the backend verifies the signature
 * itself rather than trusting that Cloudflare stripped a client-supplied header — so the
 * boundary holds even if something ever reaches the backend directly.
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(AccessProperties::class)
class AccessSecurityConfig {

    @Bean
    fun accessJwtDecoder(properties: AccessProperties, resourceLoader: ResourceLoader): JwtDecoder =
        accessJwtDecoder(properties.issuer, properties.jwkSetUri, resourceLoader).apply {
            setJwtValidator(accessAssertionValidator(properties))
        }

    @Bean
    fun accessFilterChain(http: HttpSecurity, decoder: JwtDecoder): SecurityFilterChain {
        http {
            // Disabled because the SPA sends no CSRF token and never has — not because the
            // credential is immune to CSRF. It is worth being precise: unlike an
            // `Authorization: Bearer` header, which a browser never attaches by itself,
            // Access's credential is the `CF_Authorization` **cookie**, and Cloudflare
            // mints the assertion from it at the edge regardless of who caused the request.
            // That is ambient authority, so cross-site requests do carry it. Most mutators
            // are protected incidentally — a JSON body makes a cross-site form POST fail
            // with 415 — and the one endpoint that takes no body is tracked in issue #226
            // rather than being fixed by widening this slice.
            csrf { disable() }
            sessionManagement { sessionCreationPolicy = SessionCreationPolicy.STATELESS }
            authorizeHttpRequests {
                // Two doors stay open, and only two. `/api/version` so an operator can tell
                // "the app is down" from "the app is rejecting me", and the spec because
                // `generateOpenApiDocs` boots the app to regenerate the frontend's client.
                // Notably *not* `/api/test/**`: it is `smoke`-profile-only and its callers
                // carry an assertion like everything else, so production's policy need not
                // say a database-wipe prefix is public.
                authorize("/api/version", permitAll)
                authorize("/v3/api-docs/**", permitAll)
                // Spring Security filters the ERROR dispatch too, so without this an error
                // *on an open door* is re-authorized as `/error` and comes back 401 —
                // turning "the app is up and you sent a bad request" into "the app is
                // rejecting you", which is precisely the distinction /api/version exists to
                // make. Matched on the dispatcher type rather than the `/error` path, so it
                // stays exactly what it claims to be: a container-internal forward, not a
                // third door anyone can knock on. An unauthenticated request to a gated
                // path is refused by the entry point without ever dispatching here.
                authorize(DispatcherTypeRequestMatcher(DispatcherType.ERROR), permitAll)
                authorize(anyRequest, authenticated)
            }
            oauth2ResourceServer {
                bearerTokenResolver = HeaderBearerTokenResolver(ACCESS_ASSERTION_HEADER)
                jwt { jwtDecoder = decoder }
            }
        }
        return http.build()
    }
}
