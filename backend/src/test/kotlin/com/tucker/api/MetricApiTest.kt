package com.tucker.api

import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import com.tucker.security.WithTuckerUser
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional

/** `/api/metrics` — the measurements a browser sends about Tucker itself (ADR 0038). */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class MetricApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `accepts a valid batch with no content`() {
        mockMvc.post("/api/metrics") {
            contentType = MediaType.APPLICATION_JSON
            content = batchOf(routeChange())
        }.andExpect {
            status { isNoContent() }
        }
    }

    @Test
    fun `refuses a batch holding one malformed event`() {
        mockMvc.post("/api/metrics") {
            contentType = MediaType.APPLICATION_JSON
            content = batchOf(routeChange(), routeChange(route = "/foods/206?tag=3"))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value("\"/foods/206?tag=3\" is not a route template") }
        }
    }

    @Test
    fun `stores none of a batch it refuses`() {
        mockMvc.post("/api/metrics") {
            contentType = MediaType.APPLICATION_JSON
            content = batchOf(routeChange(route = "/today"), routeChange(valueMs = 60_001))
        }.andExpect { status { isBadRequest() } }

        mockMvc.get("/api/admin/metrics") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = "admin@tucker.invalid"))
        }.andExpect {
            jsonPath("$.routes.length()") { value(0) }
        }
    }

    /** A time the browser failed to take (NaN serialises as null) is no time at all, not 0 ms. */
    @Test
    fun `refuses an event carrying no time`() {
        mockMvc.post("/api/metrics") {
            contentType = MediaType.APPLICATION_JSON
            content = batchOf(routeChange().replace("\"valueMs\":420", "\"valueMs\":null"))
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `refuses a batch naming a kind Tucker does not measure`() {
        mockMvc.post("/api/metrics") {
            contentType = MediaType.APPLICATION_JSON
            content = batchOf(routeChange(kind = "cls"))
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `refuses a batch naming a layout the app does not have`() {
        mockMvc.post("/api/metrics") {
            contentType = MediaType.APPLICATION_JSON
            content = batchOf(routeChange(layout = "tablet"))
        }.andExpect { status { isBadRequest() } }
    }

    private fun routeChange(
        route: String = "/review",
        layout: String = "phone",
        valueMs: Int = 420,
        kind: String = "route-change",
    ) =
        """{"kind":"$kind","route":"$route","valueMs":$valueMs,"layout":"$layout",""" +
            """"installed":false,"appVersion":"1.4.0"}"""

    private fun batchOf(vararg events: String) = """{"events":[${events.joinToString(",")}]}"""
}
