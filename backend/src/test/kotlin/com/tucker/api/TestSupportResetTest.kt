package com.tucker.api

import com.tucker.jooq.Tables.USER
import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import org.jooq.DSLContext
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * `POST /api/test/reset` is what gives every real-stack smoke a blank slate
 * (issue #70). Users have to be part of that slate: provisioning is what brings
 * one into being, so a smoke that asserts anything about a *new* User needs the
 * database to hold none — and once rows are scoped, a User surviving a reset
 * would carry the previous test's data into the next one.
 *
 * The `smoke` profile is activated here for the same reason compose activates it
 * for the smokes: the controller is deliberately absent from the production bean
 * graph, so this is the only way to reach it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("smoke")
@Transactional
class TestSupportResetTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var dsl: DSLContext

    @Test
    fun `resetting clears provisioned Users so each smoke starts with none`() {
        // Merely being let in provisions the caller, so this is enough to create one.
        mockMvc.get("/api/foods") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = "before-reset@tucker.invalid"))
        }.andExpect { status { isOk() } }
        assertTrue(dsl.fetchCount(USER) > 0, "precondition: somebody was provisioned")

        mockMvc.post("/api/test/reset").andExpect { status { isNoContent() } }

        assertEquals(0, dsl.fetchCount(USER), "a reset database holds no Users at all")
    }
}
