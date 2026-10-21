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
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Every `/api` response states how long the server spent on it (ADR 0038), which a
 * browser reads back through Resource Timing to split a move between pages.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ServerTimingTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `an api response carries the server's own time as an app duration`() {
        val header = mockMvc.get("/api/me").andReturn().response.getHeader("Server-Timing")

        assertNotNull(header)
        assertTrue(SERVER_TIMING.matches(header), "\"$header\" is not an app duration")
    }

    /** Refusing a sign-in is the server's work too, and a browser times that wait as well. */
    @Test
    fun `a response refused at sign-in carries it too`() {
        val response = mockMvc.get("/api/me") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.neverExpiring())
        }.andReturn().response

        assertEquals(401, response.status)
        assertTrue(SERVER_TIMING.matches(response.getHeader("Server-Timing").orEmpty()))
    }

    private companion object {
        val SERVER_TIMING = Regex("app;dur=\\d+(\\.\\d+)?")
    }
}
