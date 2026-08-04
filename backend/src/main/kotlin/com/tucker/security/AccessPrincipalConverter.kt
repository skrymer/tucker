package com.tucker.security

import com.tucker.domain.User
import com.tucker.persistence.UserRepository
import org.springframework.core.convert.converter.Converter
import org.springframework.security.authentication.AbstractAuthenticationToken
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.web.authentication.preauth.PreAuthenticatedAuthenticationToken
import org.springframework.stereotype.Component

/**
 * Turns a verified assertion into the [TuckerPrincipal] the rest of the
 * application answers to, and is **the single home of just-in-time
 * provisioning** (ADR 0020): an admitted email matching no row becomes a User
 * here and the request carries on.
 *
 * That is the whole of Tucker's signup. There is no registration screen, no
 * admin step and no second allowlist — adding someone to the Cloudflare Access
 * policy *is* what inviting them means, and this is where that invitation is
 * redeemed. A newcomer therefore lands on the ordinary first-run empty state
 * rather than an error, because to Tucker they are simply a User with nothing
 * logged yet.
 *
 * The token it returns is a [PreAuthenticatedAuthenticationToken] because the
 * name is exactly right: the authenticating happened at Cloudflare's edge, and
 * everything this backend does is verify that work and decide who it refers to.
 */
@Component
class AccessPrincipalConverter(
    private val users: UserRepository,
) : Converter<Jwt, AbstractAuthenticationToken> {

    override fun convert(source: Jwt): AbstractAuthenticationToken {
        // `lowercase()` with no argument is locale-independent, and that is
        // load-bearing rather than tidy. Ordinary ASCII case is already handled by the
        // column's NOCASE collation — but a locale-*sensitive* fold under a Turkish
        // default locale turns `I` into `ı`, a different character that NOCASE cannot
        // fold back. An assertion for `Iain@…` would then stop matching the owner row
        // V9 seeded verbatim from TUCKER_OWNER_EMAIL, and provision a second User
        // beside a history that is already spoken for.
        val email = requireNotNull(source.getClaimAsString(EMAIL_CLAIM)) {
            "a verified assertion reached the converter without an email claim — " +
                "accessAssertionValidator should have refused it with a 401"
        }.lowercase()

        // Read first, so the overwhelmingly common case — a User who already exists —
        // costs a SELECT and never takes SQLite's single write lock. The insert runs
        // only for a genuine newcomer, and resolves its own race (see insertIfAbsent).
        //
        // That SELECT is deliberately **not** cached, though the table is small and
        // static enough to invite it. The documented fix for a mistyped
        // TUCKER_OWNER_EMAIL edits this row in the database file underneath a running
        // container (deploy/README.md step 6), so a cache with no invalidation path
        // would go on resolving the stale pairing until someone restarted the app —
        // turning a one-line recovery into a puzzling one.
        val user = users.findByEmail(email) ?: users.insertIfAbsent(User(id = null, email = email))
        return PreAuthenticatedAuthenticationToken(
            TuckerPrincipal(userId = checkNotNull(user.id), email = user.email),
            source,
            emptyList(),
        )
    }

}
