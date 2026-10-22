package com.tucker.api

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.web.util.ContentCachingResponseWrapper
import java.util.Locale

/**
 * States on every `/api` response how long the server spent on it, as
 * `Server-Timing: app;dur=<ms>` (ADR 0038). The body is held until the time is known,
 * since a header cannot follow a body that has started. First of all filters, so
 * checking the sign-in counts as the server's work, and a refusal carries a time too.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class ServerTimingFilter : OncePerRequestFilter() {

    override fun shouldNotFilter(request: HttpServletRequest) = !request.requestURI.startsWith("/api/")

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val held = ContentCachingResponseWrapper(response)
        val started = System.nanoTime()
        try {
            chain.doFilter(request, held)
        } finally {
            val ms = (System.nanoTime() - started) / NANOS_PER_MS
            held.setHeader("Server-Timing", String.format(Locale.ROOT, "app;dur=%.1f", ms))
            held.copyBodyToResponse()
        }
    }

    private companion object {
        const val NANOS_PER_MS = 1_000_000.0
    }
}
