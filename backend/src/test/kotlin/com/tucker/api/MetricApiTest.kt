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

    /** Not read as a browser tab, which is what a primitive would default to. */
    @Test
    fun `refuses an event that does not say whether the app is installed`() {
        mockMvc.post("/api/metrics") {
            contentType = MediaType.APPLICATION_JSON
            content = batchOf(routeChange().replace("\"installed\":false", "\"installed\":null"))
        }.andExpect { status { isBadRequest() } }
    }

    /** Null or left out, never read as 0 ms, which is what a primitive would default to. */
    @Test
    fun `refuses a route change that does not say how long it waited on the api`() {
        assertRefusedWithout("\"apiMs\":0", "\"apiMs\":null")
    }

    @Test
    fun `refuses a route change that does not say how long the server worked`() {
        assertRefusedWithout("\"serverMs\":0", "\"serverMs\":null")
    }

    /** Null or left out, never read as a warm visit, which is what a primitive would default to. */
    @Test
    fun `refuses a route change that does not say whether it was the route's first visit`() {
        assertRefusedWithout("\"firstVisit\":false", "\"firstVisit\":null")
    }

    @Test
    fun `refuses an event that leaves out its time altogether`() {
        assertRefusedWithout("\"valueMs\":420", "\"valueMs\":null")
    }

    @Test
    fun `refuses an event that leaves out whether the app is installed altogether`() {
        assertRefusedWithout("\"installed\":false", "\"installed\":null")
    }

    /** [field] sent as [asNull], and then left out altogether: both refused. */
    private fun assertRefusedWithout(field: String, asNull: String) {
        for (event in listOf(routeChange().replace(field, asNull), routeChange().replace("$field,", ""))) {
            mockMvc.post("/api/metrics") {
                contentType = MediaType.APPLICATION_JSON
                content = batchOf(event)
            }.andExpect { status { isBadRequest() } }
        }
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
        """{"kind":"$kind","route":"$route","valueMs":$valueMs,"apiMs":0,"serverMs":0,""" +
            """"firstVisit":false,"layout":"$layout","installed":false,"appVersion":"1.4.0"}"""

    private fun batchOf(vararg events: String) = """{"events":[${events.joinToString(",")}]}"""
}
