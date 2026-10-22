package com.tucker.api

import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals

/**
 * `/api/admin/metrics` — how Tucker performs, for an Admin and nobody else (ADR 0039).
 * `admin@tucker.invalid` is the suite's one listed Admin.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AdminMetricsApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `an Admin sees a route a User moved to, counted`() {
        send(routeChange(), sender = "alice@tucker.invalid")

        mockMvc.get("/api/admin/metrics") { signedInAs(ADMIN) }.andExpect {
            status { isOk() }
            jsonPath("$.routes[0].route") { value("/review") }
            jsonPath("$.routes[0].layouts[?(@.layout == 'phone')].n") { value(1) }
        }
    }

    /** Absent figures are an explicit null (ADR 0023), never a 0 a chart would draw. */
    @Test
    fun `an Admin reads a layout's percentiles, and none where there are too few samples`() {
        send(*Array(5) { routeChange(layout = "phone", valueMs = 300) }, sender = USER)
        send(*Array(4) { routeChange(layout = "desktop", valueMs = 200) }, sender = USER)

        mockMvc.get("/api/admin/metrics") { signedInAs(ADMIN) }.andExpect {
            jsonPath("$.routes[0].layouts[0].layout") { value("phone") }
            jsonPath("$.routes[0].layouts[0].p50") { value(300) }
            jsonPath("$.routes[0].layouts[0].p75") { value(300) }
            jsonPath("$.routes[0].layouts[0].p95") { value(300) }
            jsonPath("$.routes[0].layouts[1].layout") { value("desktop") }
            jsonPath("$.routes[0].layouts[1].n") { value(4) }
            jsonPath("$.routes[0].layouts[1].p75") { value(null) }
        }
    }

    @Test
    fun `an Admin reads where a layout's time went, and its api and first-visit p75`() {
        send(
            *Array(5) {
                routeChange(valueMs = 900, apiMs = 500, serverMs = 120)
                    .replace("\"firstVisit\":false", "\"firstVisit\":true")
            },
            sender = USER,
        )

        mockMvc.get("/api/admin/metrics") { signedInAs(ADMIN) }.andExpect {
            jsonPath("$.routes[0].layouts[0].apiP75") { value(500) }
            jsonPath("$.routes[0].layouts[0].coldP75") { value(900) }
            jsonPath("$.routes[0].layouts[0].serverMs") { value(120) }
            jsonPath("$.routes[0].layouts[0].networkMs") { value(380) }
            jsonPath("$.routes[0].layouts[0].renderMs") { value(400) }
        }
    }

    /** Not 403: the page must not tell a User that there is something here they may not see. */
    @Test
    fun `answers a User who is not an Admin exactly as a path that does not exist`() {
        val unknown = mockMvc.get("/api/admin/nothing-here") { signedInAs(USER) }.andReturn().response
        val refused = mockMvc.get("/api/admin/metrics") { signedInAs(USER) }.andReturn().response

        assertEquals(404, refused.status)
        assertEquals(unknown.contentAsString, refused.contentAsString)
    }

    private fun send(vararg events: String, sender: String) {
        mockMvc.post("/api/metrics") {
            signedInAs(sender)
            contentType = MediaType.APPLICATION_JSON
            content = """{"events":[${events.joinToString(",")}]}"""
        }.andExpect { status { isNoContent() } }
    }

    /** A warm move to `/review`. */
    private fun routeChange(layout: String = "phone", valueMs: Int = 420, apiMs: Int = 0, serverMs: Int = 0) =
        """{"kind":"route-change","route":"/review","valueMs":$valueMs,"apiMs":$apiMs,"serverMs":$serverMs,""" +
            """"firstVisit":false,"layout":"$layout","installed":false,"appVersion":"1.4.0"}"""

    private fun org.springframework.test.web.servlet.MockHttpServletRequestDsl.signedInAs(email: String) {
        header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = email))
    }

    private companion object {
        const val ADMIN = "admin@tucker.invalid"
        const val USER = "alice@tucker.invalid"
    }
}
