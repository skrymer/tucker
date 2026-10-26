package com.tucker.api

import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import io.micrometer.core.instrument.Meter
import io.micrometer.core.instrument.Tags
import io.micrometer.core.instrument.distribution.DistributionStatisticConfig
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.actuate.autoconfigure.metrics.PropertiesMeterFilter
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.time.Duration
import kotlin.test.assertEquals

/**
 * `/api/actuator` — the server's own figures, for an Admin and nobody else (ADR 0039).
 * `admin@tucker.invalid` is the suite's one listed Admin.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ActuatorApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var propertiesMeterFilter: PropertiesMeterFilter

    @Test
    fun `an Admin reads the server's health`() {
        mockMvc.get("/api/actuator/health") { signedInAs(ADMIN) }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("UP") }
        }
    }

    /** The page's disk ring reads it, and disk alone turns health DOWN while there's room to act. */
    @Test
    fun `an Admin reads the data volume's disk space, down below a gigabyte free`() {
        mockMvc.get("/api/actuator/health") { signedInAs(ADMIN) }.andExpect {
            jsonPath("$.components.diskSpace.details.total") { isNumber() }
            jsonPath("$.components.diskSpace.details.free") { isNumber() }
            jsonPath("$.components.diskSpace.details.threshold") { value(GIGABYTE) }
        }
    }

    @Test
    fun `an Admin reads the server's meters as one prometheus scrape`() {
        mockMvc.get("/api/actuator/prometheus") { signedInAs(ADMIN) }.andExpect {
            status { isOk() }
            content { string(containsString("jvm_memory_used_bytes{")) }
        }
    }

    @Test
    fun `the scrape carries an endpoint's p50 and p95`() {
        mockMvc.get("/api/version")

        val quantiles = scrape().lines()
            .filter { it.startsWith("http_server_requests_seconds{") && "uri=\"/api/version\"" in it }
            .mapNotNull { QUANTILE.find(it)?.groupValues?.get(1) }

        assertEquals(listOf("0.5", "0.95"), quantiles.sorted())
    }

    /**
     * Beside counts that run since the restart, the registry's one-minute window would
     * show a recent figure (ADR 0039).
     */
    @Test
    fun `an endpoint's percentiles run since the last start, never expiring within an uptime`() {
        val id = Meter.Id("http.server.requests", Tags.of("uri", "/api/version"), null, null, Meter.Type.TIMER)

        val config = propertiesMeterFilter.configure(id, DistributionStatisticConfig.NONE)!!

        assertEquals(Duration.ofDays(3650), config.expiry)
        assertEquals(1, config.bufferLength)
    }

    /** A percentile can't be summed across series, so an endpoint is one per outcome (ADR 0039). */
    @Test
    fun `an endpoint's requests are told apart by outcome alone`() {
        mockMvc.get("/api/version")

        val labels = scrape().lines()
            .filter { it.startsWith("http_server_requests_seconds") && "uri=\"/api/version\"" in it }
            .flatMap { LABEL.findAll(it).map { label -> label.groupValues[1] } }
            .toSet()

        assertEquals(setOf("method", "uri", "outcome", "quantile"), labels)
    }

    @Test
    fun `the scrape does not time Actuator's own reads`() {
        scrape()

        val actuatorSeries = scrape().lines()
            .filter { it.startsWith("http_server_requests_seconds") && "uri=\"/api/actuator/" in it }

        assertEquals(emptyList(), actuatorSeries)
    }

    /** Spring files a request no handler matched under a catch-all uri, which names no endpoint. */
    @Test
    fun `the scrape does not time a request no endpoint matched`() {
        mockMvc.get("/api/no-such-endpoint")

        val unmatchedSeries = scrape().lines()
            .filter { it.startsWith("http_server_requests_seconds") }
            .filter { "uri=\"UNKNOWN\"" in it || "uri=\"/**\"" in it }

        assertEquals(emptyList(), unmatchedSeries)
    }

    /** Refused before any handler is matched, Spring files it under `NOT_FOUND`. */
    @Test
    fun `the scrape does not time a non-Admin refused at an Admin path no endpoint serves`() {
        mockMvc.get("/api/admin/no-such-endpoint") { signedInAs(USER) }
            .andExpect { status { isNotFound() } }

        val notFoundSeries = scrape().lines()
            .filter { it.startsWith("http_server_requests_seconds") && "uri=\"NOT_FOUND\"" in it }

        assertEquals(emptyList(), notFoundSeries)
    }

    /** They leak configuration and secrets, or change the running server (ADR 0039). */
    @ParameterizedTest
    @ValueSource(strings = ["env", "configprops", "heapdump", "threaddump", "loggers"])
    fun `an endpoint off the allowlist is not served, even to an Admin`(endpoint: String) {
        mockMvc.get("/api/actuator/$endpoint") { signedInAs(ADMIN) }.andExpect {
            status { isNotFound() }
        }
    }

    /** As the admin paths answer, so the status never says a page is here (ADR 0039). */
    @Test
    fun `a User who is not an Admin is told the server's health is not there`() {
        mockMvc.get("/api/actuator/health") { signedInAs(USER) }.andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `a User who is not an Admin is told the server's meters are not there`() {
        mockMvc.get("/api/actuator/prometheus") { signedInAs(USER) }.andExpect {
            status { isNotFound() }
        }
    }

    private fun scrape(): String =
        mockMvc.get("/api/actuator/prometheus") { signedInAs(ADMIN) }.andReturn().response.contentAsString

    private fun MockHttpServletRequestDsl.signedInAs(email: String) {
        header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = email))
    }

    private companion object {
        const val ADMIN = "admin@tucker.invalid"
        const val USER = "alice@tucker.invalid"
        const val GIGABYTE = 1_073_741_824L
        val QUANTILE = Regex("""quantile="([^"]+)"""")
        val LABEL = Regex("""[{,](\w+)="""")
    }
}
