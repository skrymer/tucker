package com.tucker.security

import org.junit.jupiter.api.AfterEach
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

    @AfterEach
    fun clearContext() = SecurityContextHolder.clearContext()

    @Test
    fun `supplies the id of the authenticated User`() {
        signIn(TuckerPrincipal(userId = 42, email = "owner@tucker.invalid"))

        assertEquals(42L, CurrentUser().id)
    }

    /**
     * Deliberately not an [IllegalStateException] or [IllegalArgumentException]:
     * [com.tucker.api.ApiExceptionHandler] maps those to 409 and 400, and reaching a
     * scoped repository with nobody authenticated is neither. The gate already 401s an
     * unauthenticated request (ADR 0020), so the only ways here are a background thread
     * running scoped code without `runAs` or a mis-wiring — server faults both, which
     * must read as 500 rather than borrow a client error's clothes.
     */
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
