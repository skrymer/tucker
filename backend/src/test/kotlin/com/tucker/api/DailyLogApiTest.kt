package com.tucker.api

import com.tucker.security.WithTuckerUser
import org.hamcrest.Matchers.closeTo
import org.hamcrest.Matchers.containsInAnyOrder
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
class DailyLogApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    private val day = LocalDate.of(2026, 10, 8)

    private fun logEstimated(on: LocalDate, label: String, calories: Double) {
        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","label":"$label","calories":$calories,"protein":null}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `the day read states the day's Entries and their calorie total`() {
        logEstimated(day, "Prepped chicken & rice", 620.0)
        logEstimated(day, "Overnight oats", 380.5)
        logEstimated(day.minusDays(1), "Yesterday's dinner", 900.0)

        mockMvc.get("/api/entries") { param("date", "$day") }.andExpect {
            status { isOk() }
            jsonPath("$.date") { value("$day") }
            jsonPath("$.entries.length()") { value(2) }
            jsonPath("$.entries[*].name") { value(containsInAnyOrder("Prepped chicken & rice", "Overnight oats")) }
            jsonPath("$.caloriesConsumed", closeTo(1000.5, 1e-6))
        }
    }

    @Test
    fun `a day with no Entries reads as no Entries and a zero total`() {
        logEstimated(day.minusDays(1), "Yesterday's dinner", 900.0)

        mockMvc.get("/api/entries") { param("date", "$day") }.andExpect {
            status { isOk() }
            jsonPath("$.date") { value("$day") }
            jsonPath("$.entries.length()") { value(0) }
            jsonPath("$.caloriesConsumed") { value(0.0) }
        }
    }
}
