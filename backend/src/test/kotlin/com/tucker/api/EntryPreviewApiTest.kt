package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.domain.WeeklyReview
import com.tucker.persistence.WeeklyReviewRepository
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
class EntryPreviewApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var reviews: WeeklyReviewRepository

    private val date = LocalDate.of(2026, 6, 18)

    /** A review inserted directly, standing in for one the adaptive engine ran. */
    private fun seedBudget(budgetKcal: Double, floorG: Double = 150.0) {
        reviews.insert(
            WeeklyReview(
                id = null,
                reviewedOn = date,
                trendWeightKg = 86.0,
                maintenanceKcal = 2400.0,
                calorieBudgetKcal = budgetKcal,
                proteinFloorG = floorG,
                note = "seed",
            ),
        )
    }

    /** Create a Food at 100 kcal / 100 g (25 g carbs → 4 × 25) and return its id. */
    private fun seedFoodAt100KcalPer100g(): Long {
        val json = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Rice","proteinPer100g":0.0,"carbsPer100g":25.0,"fatPer100g":0.0}"""
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
            jsonPath("$.length()") { value(0) }
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
            jsonPath("$.length()") { value(0) }
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
}
