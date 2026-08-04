package com.tucker.persistence

import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/** The Flyway placeholder V9 names an adopted database's owner with (issue #156). */
const val OWNER_EMAIL_PLACEHOLDER = "ownerEmail"

/**
 * Make [email] safe to sit inside the single-quoted SQL literal V9 substitutes it
 * into, by doubling any quote of its own.
 *
 * Flyway's placeholder substitution is plain text replacement with no knowledge of
 * SQL, so whatever `TUCKER_OWNER_EMAIL` holds is spliced verbatim between two
 * quotes. An apostrophe is legal in an email's local part — `o'brien@example.com`
 * is a real address shape — and splicing one in closes the literal early, leaving
 * SQLite to parse the remainder as syntax: the migration fails and the backend
 * never finishes starting. That lands on precisely the deploy V9 exists for, the
 * one with a database worth adopting.
 */
fun sqlLiteralSafe(email: String): String = email.replace("'", "''")

/**
 * Applies [sqlLiteralSafe] to the owner-email placeholder before Flyway runs.
 *
 * Doing it here rather than asking operators to pre-escape their own `.env` keeps
 * the awkwardness in one place: `TUCKER_OWNER_EMAIL` holds the address exactly as
 * Cloudflare asserts it, which is also the form it has to match at sign-in.
 */
@Configuration
class OwnerEmailPlaceholderConfig {

    @Bean
    fun escapeOwnerEmailPlaceholder(): FlywayConfigurationCustomizer =
        FlywayConfigurationCustomizer { flyway ->
            val placeholders = flyway.placeholders
            val raw = placeholders[OWNER_EMAIL_PLACEHOLDER]
            if (raw != null) {
                flyway.placeholders(
                    placeholders + (OWNER_EMAIL_PLACEHOLDER to sqlLiteralSafe(raw)),
                )
            }
        }
}
