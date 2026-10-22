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
 * since a header cannot follow a body that has started; a refusal sent as an error
 * commits there and then, so it is stamped just before. First of all filters, so
 * checking the sign-in counts as the server's work, and a refusal carries a time too.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class ServerTimingFilter : OncePerRequestFilter() {

    override fun shouldNotFilter(request: HttpServletRequest) = !request.requestURI.startsWith("/api/")

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val held = TimedResponse(response, started = System.nanoTime())
        try {
            chain.doFilter(request, held)
        } finally {
            held.stamp()
            held.copyBodyToResponse()
        }
    }

    private class TimedResponse(response: HttpServletResponse, private val started: Long) :
        ContentCachingResponseWrapper(response) {

        fun stamp() {
            val ms = (System.nanoTime() - started) / NANOS_PER_MS
            setHeader("Server-Timing", String.format(Locale.ROOT, "app;dur=%.1f", ms))
        }

        override fun sendError(sc: Int) {
            stamp()
            super.sendError(sc)
        }

        override fun sendError(sc: Int, msg: String) {
            stamp()
            super.sendError(sc, msg)
        }
    }

    private companion object {
        const val NANOS_PER_MS = 1_000_000.0
    }
}
