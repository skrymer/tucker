package com.tucker.security

import com.tucker.domain.User
import com.tucker.persistence.UserRepository
import org.springframework.security.core.context.SecurityContext
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.test.context.support.WithSecurityContext
import org.springframework.security.test.context.support.WithSecurityContextFactory
import org.springframework.security.web.authentication.preauth.PreAuthenticatedAuthenticationToken

/**
 * Signs a test class in, for the tests that call beans **directly** with no HTTP in
 * play (ADR 0021: "repository and service tests need a SecurityContext"). Over HTTP
 * nothing needs this — [AccessTestAuthConfig] already mints an assertion per request
 * and the real converter resolves it.
 *
 * The default [email] is [AccessTokens.EMAIL], and that is load-bearing rather than
 * convenient: several tests seed through a repository and then read back over HTTP,
 * so the identity the test thread writes as has to be the identity its own requests
 * authenticate as. Point them at different addresses and the row is written, owned by
 * somebody else, and simply not there a line later.
 *
 * Opt-in per class, deliberately. An ambient identity handed to every test would also
 * be handed to code that must not have one — the reminder scheduler runs on a cron
 * thread with no request behind it — and its test would then pass whether or not the
 * impersonation it depends on actually works.
 */
@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@WithSecurityContext(factory = TuckerUserSecurityContextFactory::class)
annotation class WithTuckerUser(val email: String = AccessTokens.EMAIL)

/**
 * Builds the context [WithTuckerUser] asks for, **provisioning the User** the same way
 * a first request would.
 *
 * The row has to exist, not merely be named: `user_id` is a real foreign key, so a
 * principal invented out of thin air would write rows pointing at nobody. Constructor
 * injection works here because Spring Security instantiates the factory through the
 * test context's bean factory — the same mechanism `@WithUserDetails` uses to reach a
 * `UserDetailsService`.
 */
class TuckerUserSecurityContextFactory(
    private val users: UserRepository,
) : WithSecurityContextFactory<WithTuckerUser> {

    override fun createSecurityContext(annotation: WithTuckerUser): SecurityContext {
        val user = users.findByEmail(annotation.email)
            ?: users.insertIfAbsent(User(id = null, email = annotation.email))
        return SecurityContextHolder.createEmptyContext().apply {
            authentication = PreAuthenticatedAuthenticationToken(
                TuckerPrincipal(userId = checkNotNull(user.id), email = user.email),
                null,
                emptyList(),
            )
        }
    }
}
