package com.tucker.security

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.authentication.preauth.PreAuthenticatedAuthenticationToken
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * The owner every scoped repository reads and writes against (ADR 0021). Its whole
 * job is to answer "who is asking?", so the two things worth specifying are that it
 * answers correctly and that it refuses to guess.
 */
class CurrentUserTest {

    // Both ends: the "nobody is authenticated" test states a precondition rather than
    // inheriting whatever an earlier test left on this thread.
    @BeforeEach
    @AfterEach
    fun clearContext() = SecurityContextHolder.clearContext()

    @Test
    fun `supplies the id of the authenticated User`() {
        signIn(TuckerPrincipal(userId = 42, email = "owner@tucker.invalid"))

        assertEquals(42L, CurrentUser().id)
    }

    /** Why this type rather than [IllegalStateException]: see [NoCurrentUserException]. */
    @Test
    fun `refuses to guess an owner when nobody is authenticated`() {
        val thrown = assertFailsWith<NoCurrentUserException> { CurrentUser().id }

        assertTrue(
            "no authenticated User" in thrown.message.orEmpty(),
            "the message should name the problem, was: ${thrown.message}",
        )
    }

    private fun signIn(principal: TuckerPrincipal) {
        SecurityContextHolder.getContext().authentication =
            PreAuthenticatedAuthenticationToken(principal, null, emptyList())
    }
}
