package com.tucker.api

import com.tucker.domain.Maintenance
import com.tucker.domain.WeeklyReview
import com.tucker.persistence.ReminderStateRepository
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
import kotlin.test.assertEquals

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SummaryApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var reviews: WeeklyReviewRepository
    @Autowired lateinit var reminderState: ReminderStateRepository

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
                maintenance = Maintenance(2400.0, Maintenance.Basis.FORMULA_SEED),
                calorieBudgetKcal = budgetKcal,
                proteinFloorG = floorG,
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
            content = """{"startedOn":"$on",
                          "targetWeightKg":80.0,"rateKgPerWeek":0.5}"""
        }.andExpect { status { isCreated() } }
    }

    /** Maintenance Mode setup: profile + a weight reading, but no Goal. */
    private fun maintenanceSetup(on: LocalDate) {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/weight") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","weightKg":86.0}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun `in Maintenance Mode the summary reports a Maintenance budget, protein floor, and trend weight with no Goal`() {
        val day = LocalDate.now()
        maintenanceSetup(day)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            // A review was bootstrapped: the Budget is present (Maintenance, no deficit).
            jsonPath("$.calorieBudget") { isNumber() }
            // Protein Floor = 2 g/kg of the trend (a single 86.0 reading → trend 86.0).
            jsonPath("$.proteinFloor") { value(172.0) }
            jsonPath("$.trendWeightKg") { value(86.0) }
            // Zero intake with the floor unmet — a fresh day in progress, no verdict yet.
            jsonPath("$.dayStatus") { value("in-progress") }
        }
    }

    @Test
    fun `in Maintenance Mode with too little history the summary reports drift gathering data and no rate`() {
        val day = LocalDate.now()
        maintenanceSetup(day)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            // A single same-day reading is under 14 days of history.
            jsonPath("$.driftStatus") { value("gathering-data") }
            jsonPath("$.observedRateKgPerWeek") { value(null) }
        }
    }

    @Test
    fun `the summary reports no day status before the first weekly review`() {
        // A fresh database has no WeeklyReview, so there is no Budget or Floor to
        // judge the day against — the verdict is withheld (null), unchanged from
        // the old null onTarget.
        val day = LocalDate.of(2026, 6, 10)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.dayStatus") { value(null) }
        }
    }

    /** Seed a daily reading on each of the [days] dates ending [on], at [weight]. */
    private fun seedRisingWeights(on: LocalDate, days: Long, fromKg: Double, toKg: Double) {
        for (d in 0..days) {
            val date = on.minusDays(days - d)
            val weight = fromKg + (toKg - fromKg) * d / days
            mockMvc.post("/api/weight") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"date":"$date","weightKg":$weight}"""
            }.andExpect { status { isOk() } }
        }
    }

    @Test
    fun `in Maintenance Mode with a rising trend the summary reports drifting up and the observed rate`() {
        val day = LocalDate.now()
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0}"""
        }.andExpect { status { isOk() } }
        // A month of steadily rising weight, no Goal: the trend drifts up past the band.
        seedRisingWeights(day, days = 28, fromKg = 84.0, toKg = 86.0)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.driftStatus") { value("drifting-up") }
            jsonPath("$.observedRateKgPerWeek") { isNumber() }
        }
    }

    @Test
    fun `with an active Goal the summary omits the drift fields — pace lives on the Goal`() {
        val day = LocalDate.now()
        completeSetup(day)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.driftStatus") { value(null) }
            jsonPath("$.observedRateKgPerWeek") { value(null) }
        }
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
    fun `reading the summary stamps the user's last-seen day for the absent-today gate`() {
        val day = LocalDate.of(2026, 6, 10)

        mockMvc.get("/api/summary") {
            param("date", "$day")
        }.andExpect { status { isOk() } }

        assertEquals(day, reminderState.lastSeenOn())
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
