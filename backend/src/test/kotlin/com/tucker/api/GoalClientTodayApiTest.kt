package com.tucker.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * The client owns "today" (ADR 0014): a Goal-lifecycle recompute is stamped on the
 * client's local date, never the server's wall clock. The server clock is frozen a
 * full day *ahead* of the client's date, so each test proves the review lands on
 * the client's day — the exact runner-vs-container skew that made
 * `goal-recompute-budget` flake (#84).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@Import(GoalClientTodayApiTest.FixedClockConfig::class)
class GoalClientTodayApiTest {

    /** Freeze the server clock so its "today" is a known, fixed date. */
    @TestConfiguration
    class FixedClockConfig {
        @Bean
        @Primary
        fun fixedClock(): Clock =
            Clock.fixed(SERVER_TODAY.atTime(12, 0).toInstant(ZoneOffset.UTC), ZoneOffset.UTC)
    }

    @Autowired lateinit var mockMvc: MockMvc

    private fun seedProfileAndWeight(on: LocalDate) {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","weightKg":86.0,"clientToday":"$on"}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun `creating a goal recomputes the review on the client's day, not the server's`() {
        seedProfileAndWeight(CLIENT_TODAY)

        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$CLIENT_TODAY",
                          "targetWeightKg":80.0,"rateKgPerWeek":0.5,"clientToday":"$CLIENT_TODAY"}"""
        }.andExpect { status { isCreated() } }

        mockMvc.get("/api/weekly-review").andExpect {
            status { isOk() }
            jsonPath("$.reviewedOn") { value("$CLIENT_TODAY") }
        }
    }

    @Test
    fun `switching to maintenance recomputes the review on the client's day`() {
        seedProfileAndWeight(CLIENT_TODAY)
        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$CLIENT_TODAY",
                          "targetWeightKg":80.0,"rateKgPerWeek":0.5,"clientToday":"$CLIENT_TODAY"}"""
        }.andExpect { status { isCreated() } }

        mockMvc.delete("/api/goal?clientToday=$CLIENT_TODAY").andExpect { status { isNoContent() } }

        mockMvc.get("/api/weekly-review").andExpect {
            status { isOk() }
            jsonPath("$.reviewedOn") { value("$CLIENT_TODAY") }
        }
    }

    @Test
    fun `a manual review run is stamped on the client's day`() {
        seedProfileAndWeight(CLIENT_TODAY)

        mockMvc.post("/api/weekly-review?clientToday=$CLIENT_TODAY").andExpect {
            status { isOk() }
            jsonPath("$.reviewedOn") { value("$CLIENT_TODAY") }
        }
    }

    companion object {
        private val SERVER_TODAY = LocalDate.of(2026, 6, 6)
        private val CLIENT_TODAY = SERVER_TODAY.minusDays(1) // the client's local "yesterday"
    }
}
