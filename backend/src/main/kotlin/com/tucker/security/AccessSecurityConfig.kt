package com.tucker.security

import jakarta.servlet.DispatcherType
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.io.ResourceLoader
import org.springframework.security.config.ObjectPostProcessor
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.server.resource.web.HeaderBearerTokenResolver
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.session.NullAuthenticatedSessionStrategy
import org.springframework.security.web.csrf.CookieCsrfTokenRepository
import org.springframework.security.web.csrf.CsrfFilter
import org.springframework.security.web.csrf.CsrfTokenRepository
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

    /**
     * Where the CSRF token lives on the wire: a cookie JavaScript can read, echoed back in
     * a header.
     *
     * `SameSite=Strict` because nothing off-site ever needs to send it — the token is only
     * ever read by Tucker's own page and replayed to Tucker's own origin.
     *
     * It is *not* marked `Secure`, and that is a live gap rather than a free choice: a
     * cookie an attacker can write from a sibling host over plain HTTP overwrites this one,
     * and a double-submit check trusts whatever the cookie says. What stops it is `Secure`,
     * which this repository would honour if asked (it prefers an explicit value over
     * `request.isSecure()`) — but every test client here speaks plain HTTP, and Java's
     * `CookieManager` will not send a `Secure` cookie over it, so the e2e would fail the
     * check it exists to make. Tracked with the scheme-forwarding work in issue #258; see
     * ADR 0025.
     *
     * A bean so the test suite carries the token the way a browser does — taking the cookie
     * this hands out and sending it back — against these exact attributes, rather than
     * against a second repository that could drift from them.
     */
    @Bean
    fun csrfTokenRepository(): CsrfTokenRepository =
        CookieCsrfTokenRepository.withHttpOnlyFalse().apply {
            setCookieCustomizer { it.sameSite("Strict") }
        }

    @Bean
    fun accessFilterChain(
        http: HttpSecurity,
        decoder: JwtDecoder,
        principals: AccessPrincipalConverter,
        csrfTokenRepository: CsrfTokenRepository,
    ): SecurityFilterChain {
        configureCsrf(http, csrfTokenRepository)
        http {
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
                jwt {
                    jwtDecoder = decoder
                    // Resolving the assertion to a User is part of authenticating it,
                    // not a later concern: every request arrives already knowing whose
                    // it is, and a newcomer is provisioned here rather than anywhere a
                    // caller could forget to ask (ADR 0020).
                    jwtAuthenticationConverter = principals
                }
            }
        }
        return http.build()
    }

    /**
     * CSRF protection, on because Access's credential is ambient (ADR 0025).
     *
     * Three lines here look removable and are not, and `CsrfGateTest` fails if any goes.
     * The post-processor restores the matcher `oauth2ResourceServer` overrides to exempt
     * bearer-token requests — Tucker's bearer token is the header Cloudflare mints from
     * that cookie, so without it CSRF is enabled and protects nothing. Rotation is off
     * because a stateless app re-authenticates on every request, so the stock strategy
     * deletes the cookie on each one. And `CsrfCookieFilter` is what puts a token in the
     * hands of a client that has only ever issued safe requests.
     *
     * Because the post-processor replaces the matcher wholesale, an `ignoringRequestMatchers`
     * exemption added here would be discarded rather than honoured. None is wanted — ADR 0025
     * refuses a `/api/test` bypass — but it would fail silently rather than loudly.
     *
     * Java-style rather than the `http { csrf { } }` Kotlin DSL because `CsrfDsl` exposes
     * no way to add an [ObjectPostProcessor].
     */
    private fun configureCsrf(http: HttpSecurity, repository: CsrfTokenRepository) {
        http.csrf { csrf ->
            csrf.csrfTokenRepository(repository)
            csrf.csrfTokenRequestHandler(SpaCsrfTokenRequestHandler())
            csrf.sessionAuthenticationStrategy(NullAuthenticatedSessionStrategy())
            csrf.addObjectPostProcessor(object : ObjectPostProcessor<CsrfFilter> {
                override fun <O : CsrfFilter> postProcess(filter: O): O =
                    filter.apply { setRequireCsrfProtectionMatcher(CsrfFilter.DEFAULT_CSRF_MATCHER) }
            })
        }
        http.addFilterAfter(CsrfCookieFilter(), CsrfFilter::class.java)
    }
}
