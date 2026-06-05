package com.tucker.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class GoalApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    /** Profile + a weight reading must exist before a Goal can auto-fire the first review. */
    private fun seedProfileAndWeight() {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"${java.time.LocalDate.now()}","weightKg":90.0}"""
        }.andExpect { status { isOk() } }
    }

    private fun postGoal(startedOn: String, startWeightKg: Double, targetWeightKg: Double) {
        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$startedOn","startWeightKg":$startWeightKg,
                          "targetWeightKg":$targetWeightKg,"rateKgPerWeek":0.5}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `GET goals lists every goal newest first with the active one flagged`() {
        seedProfileAndWeight()
        postGoal("2026-03-01", 95.0, 85.0)
        postGoal("2026-05-01", 90.0, 80.0)

        mockMvc.get("/api/goals").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].startedOn") { value("2026-05-01") }
            jsonPath("$[0].active") { value(true) }
            jsonPath("$[1].startedOn") { value("2026-03-01") }
            jsonPath("$[1].active") { value(false) }
        }
    }

    @Test
    fun `POST goal rejects a target not below the current trend weight with a 400 naming the rule`() {
        // The seeded reading is 90.0, so the Trend Weight is 90.0. A start of 95 keeps
        // the start-weight rule satisfied; a target of 90 equals the trend, so the Goal
        // is already-reached and is rejected at creation (ADR 0008).
        seedProfileAndWeight()

        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"${java.time.LocalDate.now()}","startWeightKg":95.0,
                          "targetWeightKg":90.0,"rateKgPerWeek":0.5}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value(org.hamcrest.Matchers.containsString("trend")) }
        }
    }

    @Test
    fun `GET goals exposes reachedOn for a goal that has been reached`() {
        // A reading the day before today establishes a Trend Weight of 90.0.
        val today = java.time.LocalDate.now()
        val yesterday = today.minusDays(1)
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$yesterday","weightKg":90.0}"""
        }.andExpect { status { isOk() } }

        // A target of 89.0 sits just below the trend, so it's a valid loss Goal.
        postGoal("$today", 90.0, 89.0)

        // An 80.0 reading today pulls the EWMA to exactly 89.0 — meeting the
        // target, which latches reachedOn on the active Goal.
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$today","weightKg":80.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.get("/api/goals").andExpect {
            status { isOk() }
            jsonPath("$[0].reachedOn") { value("$today") }
        }
    }

    @Test
    fun `GET goals returns an empty list when no goals exist`() {
        mockMvc.get("/api/goals").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }
    }

    @Test
    fun `GET goal returns 404 when no active goal exists`() {
        mockMvc.get("/api/goal").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `DELETE goal switches to maintenance — the active goal endpoint then 404s`() {
        seedProfileAndWeight()
        postGoal("${java.time.LocalDate.now()}", 90.0, 80.0)

        mockMvc.delete("/api/goal").andExpect { status { isNoContent() } }

        mockMvc.get("/api/goal").andExpect { status { isNotFound() } }
    }

    @Test
    fun `DELETE goal is an idempotent no-op returning 204 when no goal is active`() {
        mockMvc.delete("/api/goal").andExpect { status { isNoContent() } }
    }
}
