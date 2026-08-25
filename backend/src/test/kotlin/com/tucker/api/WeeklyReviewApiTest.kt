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
class WeeklyReviewApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    private fun completeSetup(on: LocalDate) {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","weightKg":86.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/goal") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"startedOn":"$on",
                          "targetWeightKg":80.0,"rateKgPerWeek":0.5}"""
        }.andExpect { status { isCreated() } }
    }

    /** A User who has said they are not counting calories, with a reading to their name. */
    private fun weightOnlySetup(on: LocalDate) {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0,"tracksCalories":false}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","weightKg":86.0}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun `a review run with Calorie Tracking off carries a Trend Weight and no Intake Targets`() {
        val today = LocalDate.now()
        weightOnlySetup(today)
        mockMvc.post("/api/weekly-review").andExpect { status { isOk() } }

        // One nullable object, not four nullable fields: one branch in the ledger
        // unlocks all four columns, and no row can carry a Floor without a Budget.
        mockMvc.get("/api/weekly-review/history").andExpect {
            status { isOk() }
            jsonPath("$[0].trendWeightKg") { value(86.0) }
            jsonPath("$[0].intakeTargets") { value(null) }
        }
    }

    @Test
    fun `the review response carries the maintenance basis as a field and omits the note`() {
        val today = LocalDate.now()
        completeSetup(today)
        mockMvc.post("/api/weekly-review").andExpect { status { isOk() } }

        // The basis is a first-class field (ADR 0002), not buried in human-readable
        // prose; with little history the cold-start seed is what the engine picks.
        mockMvc.get("/api/weekly-review").andExpect {
            status { isOk() }
            jsonPath("$.intakeTargets.maintenanceBasis") { value("FORMULA_SEED") }
            jsonPath("$.intakeTargets.note") { doesNotExist() }
        }
    }

    @Test
    fun `running the review twice the same day is idempotent and returns 200 each time`() {
        val today = LocalDate.now()
        completeSetup(today)

        val firstId = mockMvc.post("/api/weekly-review").andExpect {
            status { isOk() }
            jsonPath("$.reviewedOn") { value("$today") }
        }.andReturn().response.contentAsString

        // The repeat run on the same day returns the existing review, not an HTTP 500.
        mockMvc.post("/api/weekly-review").andExpect {
            status { isOk() }
            jsonPath("$.reviewedOn") { value("$today") }
        }.andReturn().response.contentAsString.let { second ->
            assert(second == firstId) { "repeat run returned a different review" }
        }
    }
}
