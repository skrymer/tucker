package com.tucker.security

import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component

/**
 * Scoped code ran with nobody authenticated, so there is no owner to read or write
 * against.
 *
 * Deliberately its own type rather than an [IllegalStateException]: [com.tucker.api
 * .ApiExceptionHandler] maps that to a 409, and this is not something a client did.
 * The gate 401s an unauthenticated request long before a controller (ADR 0020), so
 * the only ways to get here are a background thread running scoped code without
 * establishing a context, or a mis-wiring — server faults, which must read as 500.
 */
class NoCurrentUserException(message: String) : RuntimeException(message)

/**
 * Who the scoped repositories answer to (ADR 0021): the owner of every row a
 * request reads or writes.
 *
 * Injected into repositories rather than passed as a parameter, so a caller
 * cannot supply *an* owner instead of the *right* one — the choice is removed
 * rather than policed. It stays visible in each constructor, which is what keeps
 * the hidden input honest.
 *
 * Read from [SecurityContextHolder] on every access rather than captured once:
 * this is a singleton serving every request, and the context is thread-bound to
 * the request being served.
 */
@Component
class CurrentUser {

    val id: Long
        get() = principal().userId

    /**
     * The same owner in the width the `user_id` columns are generated as.
     *
     * A fact about the schema rather than about any one repository, so it lives here
     * once: all nine scoped repositories read the same conversion instead of each
     * carrying a copy of it.
     */
    val ownerId: Int
        get() = id.toInt()

    private fun principal(): TuckerPrincipal =
        SecurityContextHolder.getContext().authentication?.principal as? TuckerPrincipal
            ?: throw NoCurrentUserException(
                "scoped data was reached with no authenticated User in the security context",
            )
}
