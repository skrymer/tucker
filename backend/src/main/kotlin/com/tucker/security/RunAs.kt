package com.tucker.security

import com.tucker.domain.User
import org.springframework.security.core.context.SecurityContextHolder

/**
 * Run [block] on behalf of [user], as though they had made a request.
 *
 * The one sanctioned way to reach scoped data with no request in flight (ADR 0021).
 * It exists for the Weekly-Review Reminder, whose job is inherently cross-user: it
 * runs on a cron thread with no [SecurityContextHolder] of its own, and iterating
 * Users through this helper means the reminder reads the *same* scoped repositories a
 * real request reads, rather than a parallel set of unscoped queries that can drift
 * away from them unnoticed.
 *
 * Deliberately a single narrow function rather than a general impersonation
 * mechanism, and deliberately easy to grep for: any second production call site is a
 * review failure, because everywhere else the current User is a fact about the
 * request and inventing one would be a way to get it wrong. `RunAsCallSitesTest`
 * makes that rule executable rather than aspirational.
 *
 * Not Spring Security's `RunAsManager`, despite the name: that temporarily widens an
 * already-authenticated caller's *authorities* for one method. This establishes an
 * identity where there is none, which is a different job with no overlap.
 *
 * It does not route through [AccessPrincipalConverter] because there is no assertion
 * to convert, and because that converter *provisions* — this path is reached only for
 * a User the `user` table already holds. It shares the converter's token
 * construction ([asAuthentication]) so the two identities cannot drift apart.
 *
 * The previous context is restored on the way out, so a loop over Users leaves the
 * thread as it found it and one User's turn cannot bleed into the next.
 */
fun <T> runAs(user: User, block: () -> T): T {
    val authentication = TuckerPrincipal.of(user).asAuthentication()
    val previous = SecurityContextHolder.getContext()
    try {
        SecurityContextHolder.setContext(
            SecurityContextHolder.createEmptyContext().apply { this.authentication = authentication },
        )
        return block()
    } finally {
        SecurityContextHolder.setContext(previous)
    }
}
