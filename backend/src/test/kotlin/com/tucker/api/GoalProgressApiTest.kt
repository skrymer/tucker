package com.tucker.api

import org.hamcrest.Matchers.closeTo
import org.hamcrest.Matchers.not
import org.hamcrest.Matchers.nullValue
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
class GoalProgressApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    private val today = LocalDate.now()

    private fun seedProfile() {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }
    }

    private fun seedWeight(on: LocalDate, weightKg: Double) {
        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","weightKg":$weightKg}"""
        }.andExpect { status { isOk() } }
    }

    private fun seedGoal(startWeightKg: Double, targetWeightKg: Double, rateKgPerWeek: Double) {
        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$today","startWeightKg":$startWeightKg,
                          "targetWeightKg":$targetWeightKg,"rateKgPerWeek":$rateKgPerWeek}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `reports kg-to-go, percent complete, and planned finish from the active goal and live trend`() {
        seedProfile()
        seedWeight(today, 86.0)
        seedGoal(startWeightKg = 90.0, targetWeightKg = 80.0, rateKgPerWeek = 0.5)

        mockMvc.get("/api/goal/progress").andExpect {
            status { isOk() }
            jsonPath("$.startWeightKg") { value(90.0) }
            jsonPath("$.targetWeightKg") { value(80.0) }
            jsonPath("$.currentTrendKg") { value(86.0) }
            jsonPath("$.kgToGo") { value(6.0) }
            jsonPath("$.percentComplete") { value(40.0) }
            // 6 kg to go at 0.5 kg/week is 12 weeks — 84 days from today.
            jsonPath("$.plannedFinishDate") { value(today.plusWeeks(12).toString()) }
            jsonPath("$.plannedRateKgPerWeek") { value(0.5) }
            // Observed pace is a later slice — present in the shape but null for now.
            jsonPath("$.paceStatus") { value(nullValue()) }
            jsonPath("$.observedRateKgPerWeek") { value(nullValue()) }
            jsonPath("$.observedFinishDate") { value(nullValue()) }
        }
    }

    @Test
    fun `returns 404 when no active goal exists`() {
        mockMvc.get("/api/goal/progress").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `progress reads the smoothed trend, not the latest raw measurement`() {
        seedProfile()
        // A run of readings around 90 then a sharp drop to 80: the EWMA trend
        // barely moves, so progress must report ~89, never the raw 80.
        seedWeight(today.minusDays(10), 90.0)
        seedWeight(today, 80.0)
        seedGoal(startWeightKg = 90.0, targetWeightKg = 75.0, rateKgPerWeek = 0.5)

        mockMvc.get("/api/goal/progress").andExpect {
            status { isOk() }
            jsonPath("$.currentTrendKg") { value(closeTo(89.0, 1e-6)) }
            jsonPath("$.currentTrendKg") { value(not(closeTo(80.0, 0.5))) }
        }
    }
}
