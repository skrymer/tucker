package com.tucker.domain

/**
 * One person using Tucker, and the owner of everything they record (CONTEXT.md
 * `User`). Users are strictly isolated — nothing one User records is visible to
 * another (ADR 0021).
 *
 * [id] is a surrogate key and [email] a mutable attribute, not the key (ADR
 * 0020). Everything owned hangs off the id, so the address can change — an
 * operator step today — without touching a single row of history, and going
 * public later means adding credentials to this row rather than re-keying the
 * database.
 *
 * There is no `require(email.isNotBlank())` here on purpose. That an assertion
 * names a person is an *admission* decision, made at the boundary: a Cloudflare
 * service token authenticates a machine, and a machine has nothing to be a User,
 * so it is refused with a 401 before provisioning is ever reached (see
 * `accessAssertionValidator`). Restating it here would only let an email-less
 * assertion travel deeper before failing, and as something shaped like a 500.
 */
data class User(
    val id: Long?,
    val email: String,
)
