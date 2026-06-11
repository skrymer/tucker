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

    private fun seedGoal(targetWeightKg: Double, rateKgPerWeek: Double) {
        // The start weight is derived from the live trend at creation (ADR 0016).
        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$today","targetWeightKg":$targetWeightKg,"rateKgPerWeek":$rateKgPerWeek}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `reports kg-to-go, percent complete, and planned finish from the active goal and live trend`() {
        seedProfile()
        // The trend seeds at 90.0 (the day-before reading), which the Goal anchors its
        // start on (ADR 0016). Today's 80.0 pulls the EWMA to 0.1·80 + 0.9·90 = 89.0,
        // so the trend has moved 1 kg of the 10 kg to lose — 10% complete, 9 kg to go.
        seedWeight(today.minusDays(1), 90.0)
        seedGoal(targetWeightKg = 80.0, rateKgPerWeek = 0.5)
        seedWeight(today, 80.0)

        mockMvc.get("/api/goal/progress").andExpect {
            status { isOk() }
            jsonPath("$.startWeightKg", closeTo(90.0, 1e-2))
            jsonPath("$.targetWeightKg") { value(80.0) }
            jsonPath("$.currentTrendKg", closeTo(89.0, 1e-6))
            jsonPath("$.kgToGo", closeTo(9.0, 1e-6))
            jsonPath("$.percentComplete", closeTo(10.0, 1e-6))
            // 9 kg to go at 0.5 kg/week is 18 weeks — 126 days from today.
            jsonPath("$.plannedFinishDate") { value(today.plusWeeks(18).toString()) }
            jsonPath("$.plannedRateKgPerWeek") { value(0.5) }
            // Observed pace is a later slice — present in the shape but null for now.
            jsonPath("$.paceStatus") { value(nullValue()) }
            jsonPath("$.observedRateKgPerWeek") { value(nullValue()) }
            jsonPath("$.observedFinishDate") { value(nullValue()) }
            // The trend (89) is still above target (80), so the Goal isn't reached.
            jsonPath("$.reachedOn") { value(nullValue()) }
        }
    }

    @Test
    fun `surfaces reachedOn once a measurement pulls the trend across the target`() {
        seedProfile()
        // Trend sits at 80.4 (the derived start); the goal targets 80.0 (still below
        // the trend, so accepted).
        seedWeight(today.minusDays(1), 80.4)
        seedGoal(targetWeightKg = 80.0, rateKgPerWeek = 0.5)

        // A 76.0 reading pulls the EWMA to ~79.96 — across the target.
        seedWeight(today, 76.0)

        mockMvc.get("/api/goal/progress").andExpect {
            status { isOk() }
            jsonPath("$.reachedOn") { value(today.toString()) }
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
        seedGoal(targetWeightKg = 75.0, rateKgPerWeek = 0.5)

        mockMvc.get("/api/goal/progress").andExpect {
            status { isOk() }
            jsonPath("$.currentTrendKg") { value(closeTo(89.0, 1e-6)) }
            jsonPath("$.currentTrendKg") { value(not(closeTo(80.0, 0.5))) }
        }
    }
}
