package com.tucker.security

import com.tucker.domain.User
import org.springframework.security.web.authentication.preauth.PreAuthenticatedAuthenticationToken

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
) {
    companion object {
        /**
         * The principal for a stored [user] — the one place that says an id-less
         * User cannot be one.
         */
        fun of(user: User): TuckerPrincipal = TuckerPrincipal(
            userId = checkNotNull(user.id) { "a User who has never been stored cannot be a principal" },
            email = user.email,
        )
    }
}

/**
 * The single definition of what an authenticated Tucker caller *is*.
 *
 * Two paths arrive here — a verified assertion ([AccessPrincipalConverter]) and
 * the reminder's per-User impersonation ([runAs]) — and ADR 0021 justifies the
 * second on the grounds that the cron runs the same code a request runs. Two
 * hand-assembled tokens would be exactly the parallel pair that can drift, so
 * whatever an authenticated caller gains later (authorities, say) is gained here
 * once and both paths get it.
 *
 * [PreAuthenticatedAuthenticationToken] because the name is exactly right: the
 * authenticating happened at Cloudflare's edge, and this backend only verifies
 * that work and decides who it refers to.
 */
fun TuckerPrincipal.asAuthentication(credentials: Any? = null): PreAuthenticatedAuthenticationToken =
    PreAuthenticatedAuthenticationToken(this, credentials, emptyList())
