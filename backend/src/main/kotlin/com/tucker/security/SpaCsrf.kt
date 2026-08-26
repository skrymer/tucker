package com.tucker.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler
import org.springframework.security.web.csrf.CsrfTokenRequestHandler
import org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler
import org.springframework.web.filter.OncePerRequestFilter
import java.util.function.Supplier

/**
 * Resolves the CSRF token a single-page application sends (ADR 0025).
 *
 * Copied from Spring Security's reference documentation, because 6.4 ships neither this
 * nor the `csrf { spa() }` that replaces it in Spring Security 7 / Boot 4 — delete both
 * on that upgrade.
 *
 * The two halves exist because the token is rendered one way and read another. It is
 * written to the response XOR-masked, which is what stops a BREACH oracle reading it out
 * of a compressed body; a client reading it from the `XSRF-TOKEN` cookie only ever has
 * the raw value. So a token arriving in the header is resolved plain, and one arriving as
 * a form parameter — which only a server-rendered form produces — is still un-masked.
 */
class SpaCsrfTokenRequestHandler : CsrfTokenRequestHandler {

    private val plain = CsrfTokenRequestAttributeHandler()
    private val xor = XorCsrfTokenRequestAttributeHandler()

    override fun handle(
        request: HttpServletRequest,
        response: HttpServletResponse,
        csrfToken: Supplier<CsrfToken>,
    ) = xor.handle(request, response, csrfToken)

    override fun resolveCsrfTokenValue(request: HttpServletRequest, csrfToken: CsrfToken): String? =
        if (request.getHeader(csrfToken.headerName).isNullOrBlank()) {
            xor.resolveCsrfTokenValue(request, csrfToken)
        } else {
            plain.resolveCsrfTokenValue(request, csrfToken)
        }
}

/**
 * Forces the deferred CSRF token to load, so every response carries the `XSRF-TOKEN`
 * cookie the SPA reads (ADR 0025).
 *
 * Spring Security loads the token lazily, and on a *safe* method it is never asked for —
 * so without this a client that has only ever issued GETs holds no token and its first
 * mutation is refused. A refused one needs no help; ADR 0025 says why a 403 recovers on
 * ADR 0005's Retry.
 */
class CsrfCookieFilter : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        (request.getAttribute(CsrfToken::class.java.name) as? CsrfToken)?.token
        filterChain.doFilter(request, response)
    }
}
