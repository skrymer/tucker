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
