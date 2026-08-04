package com.tucker.security

import org.springframework.security.core.context.SecurityContext
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.test.context.support.WithSecurityContext
import org.springframework.security.test.context.support.WithSecurityContextFactory

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
 * Builds the context [WithTuckerUser] asks for by handing the email to
 * [AccessPrincipalConverter] — **the** home of just-in-time provisioning (ADR 0020) —
 * rather than finding-or-creating the User a second time here.
 *
 * The row has to exist, not merely be named: `user_id` is a real foreign key, so a
 * principal invented out of thin air would write rows pointing at nobody. Going
 * through the converter means the test thread is resolved to a User by the same code
 * that resolves a real request, including the locale-independent `lowercase()` whose
 * absence `UserProvisioningTest` exists to catch — a hand-rolled copy would be one
 * `.lowercase()` away from provisioning a *different* User than the assertion in the
 * same test class resolves to.
 *
 * Constructor injection works because Spring Security instantiates the factory through
 * the test context's bean factory — the same mechanism `@WithUserDetails` uses to reach
 * a `UserDetailsService`.
 */
class TuckerUserSecurityContextFactory(
    private val converter: AccessPrincipalConverter,
) : WithSecurityContextFactory<WithTuckerUser> {

    override fun createSecurityContext(annotation: WithTuckerUser): SecurityContext =
        SecurityContextHolder.createEmptyContext().apply {
            authentication = converter.convert(
                Jwt.withTokenValue("with-tucker-user")
                    .header("alg", "none")
                    .claim(EMAIL_CLAIM, annotation.email)
                    .build(),
            )
        }
}
