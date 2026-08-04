package com.tucker.security

import com.tucker.domain.User
import com.tucker.jooq.Tables.USER
import com.tucker.persistence.UserRepository
import org.jooq.DSLContext
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Just-in-time provisioning (ADR 0020): there is no signup screen and no second
 * allowlist, so admitting someone to the Cloudflare Access policy *is* what
 * inviting them means. The first request carrying an assertion Tucker has never
 * seen brings that User into being.
 *
 * These drive real assertions through the real decoder — the same signature
 * check, validators and converter a production request meets.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class UserProvisioningTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var users: UserRepository
    @Autowired lateinit var dsl: DSLContext

    @Test
    fun `an assertion from an unknown email provisions that person as a User`() {
        val newcomer = "newcomer@tucker.invalid"
        assertNull(users.findByEmail(newcomer), "precondition: nobody by that email yet")

        signedInAs(newcomer)

        val provisioned = assertNotNull(
            users.findByEmail(newcomer),
            "the first request from an admitted email should have created their User",
        )
        assertEquals(newcomer, provisioned.email)
        assertNotNull(provisioned.id, "a provisioned User carries its surrogate key")
    }

    @Test
    fun `a second assertion for the same email reuses the existing User`() {
        val regular = "regular@tucker.invalid"

        signedInAs(regular)
        val first = assertNotNull(users.findByEmail(regular))

        signedInAs(regular)
        signedInAs(regular)

        assertEquals(
            first.id,
            users.findByEmail(regular)?.id,
            "every later request should resolve to the User the first one created",
        )
        assertEquals(1, rowsFor(regular), "provisioning must not accumulate duplicate Users")
    }

    @Test
    fun `an assertion whose email differs only in case reuses the existing User`() {
        signedInAs("Mixed.Case@Tucker.invalid")
        val first = assertNotNull(users.findByEmail("mixed.case@tucker.invalid"))

        signedInAs("mixed.case@TUCKER.INVALID")

        assertEquals(
            first.id,
            users.findByEmail("MIXED.CASE@tucker.invalid")?.id,
            "case is not identity — one person must not become two accounts",
        )
        assertEquals(1, rowsFor("mixed.case@tucker.invalid"))
        assertEquals(
            "mixed.case@tucker.invalid",
            first.email,
            "the stored form is canonicalised, so what is written back is stable",
        )
    }

    @Test
    fun `a newly provisioned User's first dashboard read is the empty first-run state`() {
        // Being provisioned mid-request must leave a newcomer somewhere coherent: the
        // ordinary first-run empty state the SetupBanner renders (ADR 0020), not an
        // error and not a dashboard half-populated with figures they have not earned.
        mockMvc.get("/api/summary") {
            param("date", LocalDate.now().toString())
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = "first-timer@tucker.invalid"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.entries") { isEmpty() }
            jsonPath("$.caloriesConsumed") { value(0.0) }
            // Budget, floor and verdict stay absent until a Weekly Review has run,
            // which is what the setup flow exists to make possible.
            jsonPath("$.calorieBudget") { isEmpty() }
            jsonPath("$.proteinFloor") { isEmpty() }
            jsonPath("$.dayStatus") { isEmpty() }
        }
    }

    @Test
    fun `provisioning an email that already exists yields the existing User`() {
        // The losing half of the one race provisioning has: two devices a newcomer
        // opens together can both read "no such User" before either writes. Driving
        // the second write directly is how that branch gets exercised without
        // choreographing threads — and it is the branch that silently did not work
        // when it was an exception handler.
        val shared = "raced@tucker.invalid"
        val winner = users.insertIfAbsent(User(id = null, email = shared))

        val loser = users.insertIfAbsent(User(id = null, email = shared))

        assertEquals(winner.id, loser.id, "the loser must adopt the winner's User, not fail")
        assertEquals(shared, loser.email)
        assertEquals(1, rowsFor(shared), "the race must not leave two Users behind")
    }

    /** How many `user` rows carry [email] — the duplicate check `findByEmail` cannot make. */
    private fun rowsFor(email: String): Int =
        dsl.fetchCount(USER, USER.EMAIL.eq(email))

    /** Drive one authenticated request as [email], asserting only that it was let in. */
    private fun signedInAs(email: String) {
        mockMvc.get("/api/foods") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = email))
        }.andExpect { status { isOk() } }
    }
}
