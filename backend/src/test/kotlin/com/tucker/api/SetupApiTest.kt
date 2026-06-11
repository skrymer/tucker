package com.tucker.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SetupApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `completing profile, weight and goal auto-fires the first review and yields a budget`() {
        val today = LocalDate.now()

        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$today","weightKg":86.0}"""
        }.andExpect { status { isOk() } }

        // Setting the first Goal on a fresh install auto-fires the first weekly
        // review in the same transaction — no manual review trigger needed.
        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$today",
                          "targetWeightKg":80.0,"rateKgPerWeek":0.5}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.dailyDeficitKcal") { exists() }
        }

        // The review ran, so the weekly-review and the dashboard summary both
        // now expose a real Calorie Budget and Protein Floor.
        mockMvc.get("/api/weekly-review").andExpect {
            status { isOk() }
            jsonPath("$.calorieBudgetKcal") { exists() }
            jsonPath("$.proteinFloorG") { exists() }
        }

        mockMvc.get("/api/summary") {
            param("date", "$today")
        }.andExpect {
            status { isOk() }
            jsonPath("$.calorieBudget") { isNumber() }
            jsonPath("$.proteinFloor") { isNumber() }
        }
    }

    @Test
    fun `a goal whose target is above the start weight is rejected with 400`() {
        // The start weight is the live trend (ADR 0016): a reading of 86.0 makes it
        // 86.0, and a target of 90.0 sits above it, so the loss Goal is rejected.
        val today = LocalDate.now()
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$today","weightKg":86.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$today",
                          "targetWeightKg":90.0,"rateKgPerWeek":0.5}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `running a weekly review with no Goal set is a 409`() {
        mockMvc.post("/api/weekly-review").andExpect { status { isConflict() } }
    }
}
