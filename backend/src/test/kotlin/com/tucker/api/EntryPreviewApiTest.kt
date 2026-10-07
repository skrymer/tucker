package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.domain.IntakeTargets
import com.tucker.domain.Maintenance
import com.tucker.domain.WeeklyReview
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.security.WithTuckerUser
import org.hamcrest.Matchers.closeTo
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class EntryPreviewApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var reviews: WeeklyReviewRepository

    private val date = LocalDate.of(2026, 6, 18)

    /** A review inserted directly, standing in for one the adaptive engine ran. */
    private fun seedBudget(budgetKcal: Double, floorG: Double = 150.0, on: LocalDate = date) {
        reviews.insert(
            WeeklyReview(
                id = null,
                reviewedOn = on,
                trendWeightKg = 86.0,
                intakeTargets = IntakeTargets(
                    maintenance = Maintenance(2400.0, Maintenance.Basis.FORMULA_SEED),
                    calorieBudgetKcal = budgetKcal,
                    proteinFloorG = floorG,
                ),
            ),
        )
    }

    /** Create a Food at 100 kcal / 100 g (25 g carbs → 4 × 25) and return its id. */
    private fun seedFoodAt100KcalPer100g(): Long {
        val json = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Rice","proteinPer100g":0.0,"carbsPer100g":25.0,"fatPer100g":0.0,"tagIds":[]}"""
        }.andReturn().response.contentAsString
        return objectMapper.readTree(json).get("id").asLong()
    }

    private fun logEstimated(calories: Double, label: String = "lunch out") {
        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$date","label":"$label","calories":$calories,"protein":null}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `previewing a weighed entry that would exceed the budget reports it`() {
        seedBudget(2000.0)
        val foodId = seedFoodAt100KcalPer100g()
        logEstimated(1500.0) // 500 kcal to spare

        mockMvc.post("/api/entries/weighed/preview") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$date","foodId":$foodId,"grams":600.0}""" // 600 kcal → 2,100
        }.andExpect {
            status { isOk() }
            jsonPath("$.wouldExceedBudget") { value(true) }
            jsonPath("$.projectedCaloriesConsumed", closeTo(2100.0, 1e-6))
            jsonPath("$.calorieBudget", closeTo(2000.0, 1e-6))
            jsonPath("$.overByKcal", closeTo(100.0, 1e-6))
        }
    }

    @Test
    fun `previewing a weighed entry persists nothing`() {
        seedBudget(2000.0)
        val foodId = seedFoodAt100KcalPer100g()

        mockMvc.post("/api/entries/weighed/preview") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$date","foodId":$foodId,"grams":600.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.get("/api/entries") { param("date", "$date") }.andExpect {
            status { isOk() }
            jsonPath("$.entries.length()") { value(0) }
        }
    }

    @Test
    fun `previewing an estimated entry that would exceed the budget reports it`() {
        seedBudget(2000.0)
        logEstimated(1500.0) // 500 kcal to spare

        mockMvc.post("/api/entries/estimated/preview") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$date","label":"dinner out","calories":600.0,"protein":null}""" // → 2,100
        }.andExpect {
            status { isOk() }
            jsonPath("$.wouldExceedBudget") { value(true) }
            jsonPath("$.projectedCaloriesConsumed", closeTo(2100.0, 1e-6))
            jsonPath("$.calorieBudget", closeTo(2000.0, 1e-6))
            jsonPath("$.overByKcal", closeTo(100.0, 1e-6))
        }
    }

    @Test
    fun `previewing an estimated entry persists nothing`() {
        seedBudget(2000.0)

        mockMvc.post("/api/entries/estimated/preview") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$date","label":"dinner out","calories":600.0,"protein":null}"""
        }.andExpect { status { isOk() } }

        mockMvc.get("/api/entries") { param("date", "$date") }.andExpect {
            status { isOk() }
            jsonPath("$.entries.length()") { value(0) }
        }
    }

    @Test
    fun `previewing before any review reports a null budget and cannot exceed it`() {
        val foodId = seedFoodAt100KcalPer100g() // no budget seeded yet

        mockMvc.post("/api/entries/weighed/preview") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$date","foodId":$foodId,"grams":600.0}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.wouldExceedBudget") { value(false) }
            jsonPath("$.projectedCaloriesConsumed", closeTo(600.0, 1e-6))
            jsonPath("$.calorieBudget") { value(null) }
            jsonPath("$.overByKcal") { value(null) }
        }
    }

    @Test
    fun `previewing judges the day against the review standing on it, not a later one`() {
        seedBudget(2000.0)
        // Stamped by a device already on tomorrow (ADR 0014), with a tighter Budget.
        seedBudget(1500.0, on = date.plusDays(1))
        logEstimated(1400.0)

        mockMvc.post("/api/entries/estimated/preview") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$date","label":"dinner out","calories":500.0,"protein":null}""" // → 1,900
        }.andExpect {
            status { isOk() }
            jsonPath("$.wouldExceedBudget") { value(false) }
            jsonPath("$.calorieBudget", closeTo(2000.0, 1e-6))
        }
    }

    @Test
    fun `previewing a weighed entry dated after the client's tomorrow is refused with 400`() {
        val clientToday = LocalDate.now()
        val dayAfterTomorrow = clientToday.plusDays(2)
        val foodId = seedFoodAt100KcalPer100g()

        mockMvc.post("/api/entries/weighed/preview") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$dayAfterTomorrow","foodId":$foodId,"grams":60.0,"clientToday":"$clientToday"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `previewing a weighed entry with an implausible clientToday is refused with 400`() {
        val clientToday = LocalDate.now().plusDays(2)
        val foodId = seedFoodAt100KcalPer100g()

        mockMvc.post("/api/entries/weighed/preview") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$clientToday","foodId":$foodId,"grams":60.0,"clientToday":"$clientToday"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `previewing a weighed entry for tomorrow totals tomorrow's Entries, not today's`() {
        val clientToday = LocalDate.now()
        val tomorrow = clientToday.plusDays(1)
        seedBudget(2000.0, on = clientToday)
        val foodId = seedFoodAt100KcalPer100g()
        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$clientToday","label":"today's lunch","calories":1500.0,"protein":null}"""
        }.andExpect { status { isCreated() } }
        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$tomorrow","label":"tomorrow's breakfast","calories":300.0,"protein":null}"""
        }.andExpect { status { isCreated() } }

        mockMvc.post("/api/entries/weighed/preview") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$tomorrow","foodId":$foodId,"grams":600.0,"clientToday":"$clientToday"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.projectedCaloriesConsumed", closeTo(900.0, 1e-6)) // 300 + 600, not 1,500 + 600
            jsonPath("$.wouldExceedBudget") { value(false) }
            jsonPath("$.calorieBudget", closeTo(2000.0, 1e-6))
        }
    }
}
