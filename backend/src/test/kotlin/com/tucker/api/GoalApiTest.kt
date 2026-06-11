package com.tucker.api

import org.hamcrest.Matchers.closeTo
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

    private fun postGoal(startedOn: String, targetWeightKg: Double) {
        // The start weight is derived from the live trend (ADR 0016), not sent.
        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$startedOn","targetWeightKg":$targetWeightKg,"rateKgPerWeek":0.5}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `GET goals lists every goal newest first with the active one flagged`() {
        seedProfileAndWeight()
        postGoal("2026-03-01", 85.0)
        postGoal("2026-05-01", 80.0)

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
        // The start weight is the live trend (ADR 0016): the seeded reading is 90.0,
        // so the trend — and the derived start — is 90.0. A target of 90.0 isn't below
        // it, so the Goal is already-reached and is rejected at creation, naming the rule.
        seedProfileAndWeight()

        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"${java.time.LocalDate.now()}",
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

        // A target of 89.0 sits just below the trend (the derived start), so it's a
        // valid loss Goal.
        postGoal("$today", 89.0)

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
    fun `POST goal derives the start weight from the live trend, not a client value`() {
        // Two readings a day apart: the trend lags the latest reading.
        // EWMA (α = 0.10): 0.1·107.5 + 0.9·107.0 = 107.05.
        val today = java.time.LocalDate.now()
        val yesterday = today.minusDays(1)
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$yesterday","weightKg":107.0}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$today","weightKg":107.5}"""
        }.andExpect { status { isOk() } }

        // The request carries no startWeightKg; the backend anchors it on the trend
        // (ADR 0016) — 107.05, not the raw 107.5.
        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$today","targetWeightKg":88.0,"rateKgPerWeek":0.5}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.startWeightKg", closeTo(107.05, 1e-2))
        }

        // Start == now == the trend (both 107.05, not the raw 107.5), so a fresh Goal
        // reads 0% — the raw-anchored bug would put start at 107.5 against a now of
        // 107.05 and read ~2.3%. (The exact percent math is covered in GoalProgressApiTest.)
        mockMvc.get("/api/goal/progress").andExpect {
            status { isOk() }
            jsonPath("$.startWeightKg", closeTo(107.05, 1e-2))
            jsonPath("$.currentTrendKg", closeTo(107.05, 1e-2))
        }
    }

    @Test
    fun `POST goal is rejected with 400 when no weight has been logged yet`() {
        // Without a reading there's no trend to anchor the start weight on (ADR 0016),
        // so a Goal can't be created. The UI gates this; the backend backstops it.
        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"${java.time.LocalDate.now()}","targetWeightKg":80.0,"rateKgPerWeek":0.5}"""
        }.andExpect { status { isBadRequest() } }
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
        postGoal("${java.time.LocalDate.now()}", 80.0)

        mockMvc.delete("/api/goal").andExpect { status { isNoContent() } }

        mockMvc.get("/api/goal").andExpect { status { isNotFound() } }
    }

    @Test
    fun `DELETE goal is an idempotent no-op returning 204 when no goal is active`() {
        mockMvc.delete("/api/goal").andExpect { status { isNoContent() } }
    }
}
