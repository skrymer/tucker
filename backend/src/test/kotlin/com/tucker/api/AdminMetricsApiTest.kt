package com.tucker.api

import com.tucker.domain.BrowserEngine
import com.tucker.domain.MetricBatch
import com.tucker.domain.MetricEvent
import com.tucker.domain.MetricKind
import com.tucker.domain.MetricLayout
import com.tucker.domain.MetricSource
import com.tucker.domain.OperatingSystem
import com.tucker.domain.Platform
import com.tucker.persistence.MetricEventRepository
import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import org.hamcrest.Matchers.contains
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant
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

    @Autowired lateinit var metrics: MetricEventRepository

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

    @Test
    fun `an Admin reads only the moves recorded within the chosen range`() {
        store(move(), daysAgo = 6)
        store(move(), daysAgo = 8)

        mockMvc.get("/api/admin/metrics?range=7d") { signedInAs(ADMIN) }.andExpect {
            jsonPath("$.routes[0].layouts[0].n") { value(1) }
        }
    }

    @Test
    fun `an Admin who chooses no range reads the last 30 days`() {
        store(move(), daysAgo = 29)
        store(move(), daysAgo = 31)

        mockMvc.get("/api/admin/metrics") { signedInAs(ADMIN) }.andExpect {
            jsonPath("$.routes[0].layouts[0].n") { value(1) }
        }
    }

    @Test
    fun `an Admin reads only the moves made in the chosen browser engine`() {
        send(routeChange(), sender = USER, userAgent = CHROME_ON_IPHONE)
        send(routeChange(), sender = USER, userAgent = CHROME_ON_ANDROID)

        mockMvc.get("/api/admin/metrics?engine=webkit") { signedInAs(ADMIN) }.andExpect {
            jsonPath("$.routes[0].layouts[0].n") { value(1) }
        }
    }

    @Test
    fun `an Admin reads only the moves made in the chosen app version`() {
        store(move(appVersion = "1.4.0"))
        store(move(appVersion = "1.5.0"))

        mockMvc.get("/api/admin/metrics?version=1.5.0") { signedInAs(ADMIN) }.andExpect {
            jsonPath("$.routes[0].layouts[0].n") { value(1) }
        }
    }

    @Test
    fun `an Admin reads only the moves made in the installed app`() {
        store(move(installed = true))
        store(move(installed = false))

        mockMvc.get("/api/admin/metrics?installed=true") { signedInAs(ADMIN) }.andExpect {
            jsonPath("$.routes[0].layouts[0].n") { value(1) }
        }
    }

    /** Spring's own reading of a Boolean, which the frontend's mock of this endpoint follows. */
    @Test
    fun `reads an installed filter in any spelling Spring takes for true`() {
        store(move(installed = true))
        store(move(installed = false))

        mockMvc.get("/api/admin/metrics") {
            signedInAs(ADMIN)
            param("installed", " Yes ")
        }.andExpect {
            jsonPath("$.routes[0].layouts[0].n") { value(1) }
        }
    }

    @Test
    fun `refuses an Admin a range it does not offer`() {
        mockMvc.get("/api/admin/metrics?range=1y") { signedInAs(ADMIN) }.andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value("\"1y\" is not a range") }
        }
    }

    @Test
    fun `refuses an Admin a browser engine Tucker does not tell apart`() {
        mockMvc.get("/api/admin/metrics?engine=safari") { signedInAs(ADMIN) }.andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value("\"safari\" is not a browser engine") }
        }
    }

    @Test
    fun `refuses an Admin an installed filter that is neither true nor false`() {
        mockMvc.get("/api/admin/metrics?installed=maybe") { signedInAs(ADMIN) }.andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value("installed must be true or false, not \"maybe\"") }
        }
    }

    /** Every version stays listed while one is chosen, so the Admin can switch to another. */
    @Test
    fun `an Admin reads which app versions the range holds, the latest recorded first`() {
        store(move(appVersion = "1.3.0"), daysAgo = 40)
        store(move(appVersion = "1.4.0"), daysAgo = 2)
        store(move(appVersion = "1.5.0"), daysAgo = 1)

        mockMvc.get("/api/admin/metrics?version=1.4.0") { signedInAs(ADMIN) }.andExpect {
            jsonPath("$.versions", contains("1.5.0", "1.4.0"))
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

    /** A filter it cannot read must not be refused first, which would say the page is here. */
    @Test
    fun `answers a User who is not an Admin as a path that does not exist, whatever the filters say`() {
        val unknown = mockMvc.get("/api/admin/nothing-here") { signedInAs(USER) }.andReturn().response
        val refused = mockMvc.get("/api/admin/metrics?range=1y") { signedInAs(USER) }.andReturn().response

        assertEquals(404, refused.status)
        assertEquals(unknown.contentAsString, refused.contentAsString)
    }

    /** A method the page does not take must not be refused as such, which would say the page is here. */
    @Test
    fun `answers a User who is not an Admin as a path that does not exist, whatever the method`() {
        val unknown = mockMvc.delete("/api/admin/nothing-here") { signedInAs(USER) }.andReturn().response
        val refused = mockMvc.delete("/api/admin/metrics") { signedInAs(USER) }.andReturn().response

        assertEquals(404, refused.status)
        assertEquals(unknown.contentAsString, refused.contentAsString)
    }

    private fun send(vararg events: String, sender: String, userAgent: String = CHROME_ON_IPHONE) {
        mockMvc.post("/api/metrics") {
            signedInAs(sender)
            header(HttpHeaders.USER_AGENT, userAgent)
            contentType = MediaType.APPLICATION_JSON
            content = """{"events":[${events.joinToString(",")}]}"""
        }.andExpect { status { isNoContent() } }
    }

    /** A warm move to `/review`. */
    private fun routeChange(
        layout: String = "phone",
        valueMs: Int = 420,
        apiMs: Int = 0,
        serverMs: Int = 0,
    ) =
        """{"kind":"route-change","route":"/review","valueMs":$valueMs,"apiMs":$apiMs,"serverMs":$serverMs,""" +
            """"firstVisit":false,"layout":"$layout","installed":false,"appVersion":"1.4.0"}"""

    /** Stores [event] as though it had been sent [daysAgo] days ago, which a send cannot. */
    private fun store(event: MetricEvent, daysAgo: Long = 0) {
        metrics.insert(MetricBatch(listOf(event)), recordedAt = Instant.now().minus(Duration.ofDays(daysAgo)))
    }

    /** A warm move to `/review` on a phone in WebKit. */
    private fun move(appVersion: String = "1.4.0", installed: Boolean = false) = MetricEvent(
        kind = MetricKind.ROUTE_CHANGE,
        route = "/review",
        valueMs = 400,
        apiMs = 0,
        serverMs = 0,
        firstVisit = false,
        source = MetricSource(
            MetricLayout.PHONE,
            installed = installed,
            appVersion = appVersion,
            platform = Platform(BrowserEngine.WEBKIT, OperatingSystem.IOS),
        ),
    )

    private fun org.springframework.test.web.servlet.MockHttpServletRequestDsl.signedInAs(email: String) {
        header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = email))
    }

    private companion object {
        const val ADMIN = "admin@tucker.invalid"
        const val USER = "alice@tucker.invalid"
        const val CHROME_ON_IPHONE =
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 " +
                "(KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1"
        const val CHROME_ON_ANDROID =
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/141.0.0.0 Mobile Safari/537.36"
    }
}
