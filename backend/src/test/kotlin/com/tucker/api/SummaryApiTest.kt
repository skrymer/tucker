package com.tucker.api

import com.tucker.domain.WeeklyReview
import com.tucker.persistence.WeeklyReviewRepository
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
class SummaryApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var reviews: WeeklyReviewRepository

    /** A review inserted directly, standing in for one the adaptive engine ran. */
    private fun seedReview(
        on: LocalDate,
        budgetKcal: Double,
        floorG: Double,
    ): WeeklyReview =
        reviews.insert(
            WeeklyReview(
                id = null,
                reviewedOn = on,
                trendWeightKg = 86.0,
                maintenanceKcal = 2400.0,
                calorieBudgetKcal = budgetKcal,
                proteinFloorG = floorG,
                note = "seed",
            ),
        )

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
            content = """{"startedOn":"$on","startWeightKg":86.0,
                          "targetWeightKg":80.0,"rateKgPerWeek":0.5}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `loading the summary a week after the last review fires a catch-up review dated today`() {
        val setupDay = LocalDate.now()
        completeSetup(setupDay)

        // The dashboard is read a week later — the local day the client supplies.
        val nextWeek = setupDay.plusWeeks(1)
        mockMvc.get("/api/summary") {
            param("date", "$nextWeek")
        }.andExpect { status { isOk() } }

        // The catch-up ran on the summary read: the latest review snapped to today.
        mockMvc.get("/api/weekly-review").andExpect {
            status { isOk() }
            jsonPath("$.reviewedOn") { value("$nextWeek") }
        }
    }

    @Test
    fun `the summary reports a budget change when the latest review differs from the previous`() {
        val prev = LocalDate.of(2026, 5, 15)
        val latest = prev.plusWeeks(1)
        seedReview(prev, budgetKcal = 1850.0, floorG = 172.0)
        val review = seedReview(latest, budgetKcal = 1800.0, floorG = 168.0)

        // Read on the latest review's day, so no catch-up is due to disturb it.
        mockMvc.get("/api/summary") {
            param("date", "$latest")
        }.andExpect {
            status { isOk() }
            jsonPath("$.budgetChange.reviewId") { value(review.id) }
            jsonPath("$.budgetChange.previousBudgetKcal") { value(1850.0) }
            jsonPath("$.budgetChange.newBudgetKcal") { value(1800.0) }
            jsonPath("$.budgetChange.previousFloorG") { value(172.0) }
            jsonPath("$.budgetChange.newFloorG") { value(168.0) }
        }
    }

    @Test
    fun `the summary reports no budget change on the first-ever review`() {
        val first = LocalDate.of(2026, 5, 22)
        seedReview(first, budgetKcal = 1850.0, floorG = 172.0)

        mockMvc.get("/api/summary") {
            param("date", "$first")
        }.andExpect {
            status { isOk() }
            jsonPath("$.budgetChange") { value(null) }
        }
    }

    @Test
    fun `the summary reports no budget change when a review left the budget and floor unchanged`() {
        val prev = LocalDate.of(2026, 5, 15)
        val latest = prev.plusWeeks(1)
        seedReview(prev, budgetKcal = 1850.0, floorG = 172.0)
        seedReview(latest, budgetKcal = 1850.0, floorG = 172.0)

        mockMvc.get("/api/summary") {
            param("date", "$latest")
        }.andExpect {
            status { isOk() }
            jsonPath("$.budgetChange") { value(null) }
        }
    }

    @Test
    fun `loading the summary the same day does not re-run the review`() {
        val setupDay = LocalDate.now()
        completeSetup(setupDay)

        mockMvc.get("/api/summary") {
            param("date", "$setupDay")
        }.andExpect { status { isOk() } }

        // No second review: the first one, dated the setup day, is still the latest.
        mockMvc.get("/api/weekly-review/history").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
        }
    }
}
