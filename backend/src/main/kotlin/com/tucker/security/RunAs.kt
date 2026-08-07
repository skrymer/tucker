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
 * The thread is left as it was found, so a loop over Users cannot let one turn bleed
 * into the next. A thread that arrived with nobody signed in is *cleared* rather than
 * handed back an empty context: `getContext()` is not a pure read — it creates and
 * installs an empty context when the thread-local is unset — so restoring what it
 * returned would leave the cron thread holding a context it never had. Nothing can
 * read an identity out of that, but "as it found it" should be true as written.
 */
fun <T> runAs(user: User, block: () -> T): T {
    val authentication = TuckerPrincipal.of(user).asAuthentication()
    val previous = SecurityContextHolder.getContext().takeIf { it.authentication != null }
    try {
        SecurityContextHolder.setContext(
            SecurityContextHolder.createEmptyContext().apply { this.authentication = authentication },
        )
        return block()
    } finally {
        if (previous == null) SecurityContextHolder.clearContext() else SecurityContextHolder.setContext(previous)
    }
}
