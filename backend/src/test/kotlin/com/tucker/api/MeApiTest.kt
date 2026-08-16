package com.tucker.api

import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional

/**
 * The one piece of identity the frontend is given: the address to print in
 * "Signed in as…" (#160).
 *
 * It comes from the backend rather than being read out of the assertion in the
 * browser, and not only because ADR 0002 puts derived state here — the SPA never
 * holds a credential to read. `pnpm dev` and the deployed origin both attach it
 * server-side in the `/api` proxy, so the client has nothing to parse.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class MeApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    /**
     * The line this feeds exists to answer "whose diet am I looking at?", so an
     * endpoint that answered the same thing for everybody would be worse than
     * absent: it would state the wrong name over somebody else's data with total
     * confidence. Two assertions, one request each, and neither sees the other's
     * address.
     *
     * One test rather than two, deliberately: a "returns the caller's email"
     * test against the suite's default identity is a strict subset of this one —
     * no change to the controller can redden it while leaving this green — so it
     * would only be a second thing to keep in step.
     */
    @Test
    fun `answers each caller with their own address, not a shared one`() {
        mockMvc.get("/api/me") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = "alice@tucker.invalid"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.email") { value("alice@tucker.invalid") }
        }

        mockMvc.get("/api/me") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = "bob@tucker.invalid"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.email") { value("bob@tucker.invalid") }
        }
    }
}
