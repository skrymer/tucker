package com.tucker.security

/**
 * Who Tucker takes the caller to be, once Cloudflare's assertion has been
 * verified and resolved to a row (ADR 0020).
 *
 * [userId] is what everything hangs off — from the scoping slices on, it is the
 * owner every repository reads and writes against. [email] rides along for
 * display ("Signed in as…") and diagnostics only: it is a mutable attribute, so
 * nothing may key off it.
 */
data class TuckerPrincipal(
    val userId: Long,
    val email: String,
)
