package com.tucker.security

import com.tucker.domain.User
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.security.core.context.SecurityContextHolder
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/**
 * [runAs] is the one sanctioned way to reach scoped data with no request in flight
 * (ADR 0021), so what it leaves behind on the thread is a specification, not an
 * implementation detail: the reminder runs every User's turn on the *same* thread,
 * one after another, and a context that outlives its turn would silently hand the
 * next User the previous one's rows.
 *
 * Driven directly rather than through the scheduler because two of the three rules
 * are invisible from there — the tick only ever starts anonymous, and only
 * `ReminderScheduler`'s own catch makes a thrown turn observable at all.
 */
class RunAsTest {

    private val alice = User(id = 7, email = "alice@tucker.invalid")
    private val bob = User(id = 8, email = "bob@tucker.invalid")

    @AfterEach
    fun leaveNobodySignedIn() = SecurityContextHolder.clearContext()

    @Test
    fun `the block runs as the given User`() {
        val seen = runAs(alice) { CurrentUser().id }

        assertEquals(alice.id, seen)
    }

    @Test
    fun `a thread that arrived with nobody signed in is left that way`() {
        runAs(alice) { CurrentUser().id }

        // Not merely "has no principal" — the thread-local itself must be clear, or a
        // pooled thread carries a context it never had into whatever runs next.
        assertNull(SecurityContextHolder.getContext().authentication)
    }

    @Test
    fun `a thread that was already signed in gets its own identity back`() {
        SecurityContextHolder.setContext(
            SecurityContextHolder.createEmptyContext().apply {
                authentication = TuckerPrincipal.of(bob).asAuthentication()
            },
        )

        runAs(alice) { CurrentUser().id }

        assertEquals(bob.id, CurrentUser().id)
    }

    @Test
    fun `a block that throws still hands the thread back`() {
        assertFailsWith<IllegalStateException> {
            runAs(alice) { error("the reminder for this User blew up") }
        }

        // The reminder catches a failing turn and carries on to the next User, so a
        // restore that only happened on the happy path would run that next turn as
        // whoever just failed.
        assertNull(SecurityContextHolder.getContext().authentication)
    }

    @Test
    fun `a User who has never been stored cannot be run as`() {
        assertFailsWith<IllegalStateException> {
            runAs(User(id = null, email = "nobody@tucker.invalid")) { CurrentUser().id }
        }
    }
}
