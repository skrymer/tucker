package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
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

/**
 * Entries logged ahead for tomorrow (ADR 0035) count toward none of today's
 * figures: each read is bounded by the day the client asks about.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class TomorrowsEntriesApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    private val today = LocalDate.of(2026, 10, 7)
    private val tomorrow = today.plusDays(1)

    /** A Food at 100 kcal / 100 g (25 g carbs → 4 × 25), returning its id. */
    private fun createFood(name: String): Long {
        val json = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","proteinPer100g":0.0,"carbsPer100g":25.0,"fatPer100g":0.0,"tagIds":[]}"""
        }.andReturn().response.contentAsString
        return objectMapper.readTree(json).get("id").asLong()
    }

    private fun logWeighed(on: LocalDate, foodId: Long, grams: Double) {
        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","foodId":$foodId,"grams":$grams}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `tomorrow's Entries reach none of today's figures`() {
        val salmon = createFood("Salmon")
        val oats = createFood("Rolled oats")
        logWeighed(today, salmon, 150.0) // 150 kcal today
        repeat(3) { logWeighed(tomorrow, oats, 60.0) } // 180 kcal tomorrow, oats the more frequent

        mockMvc.get("/api/summary") { param("date", "$today") }.andExpect {
            status { isOk() }
            jsonPath("$.caloriesConsumed", closeTo(150.0, 1e-6))
            jsonPath("$.entries.length()") { value(1) }
        }
        mockMvc.get("/api/foods/frequent") {
            param("from", "${today.minusDays(29)}")
            param("to", "$today")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].name") { value("Salmon") }
        }
        mockMvc.get("/api/intake-breakdown") {
            param("from", "$today")
            param("to", "$today")
        }.andExpect {
            status { isOk() }
            jsonPath("$.totalCalories", closeTo(150.0, 1e-6))
        }
        mockMvc.get("/api/micronutrient-intake") {
            param("from", "${today.minusDays(6)}")
            param("to", "$today")
        }.andExpect {
            status { isOk() }
            jsonPath("$.totalCalories", closeTo(150.0, 1e-6))
        }
    }

    @Test
    fun `a weighed Entry dated after the client's tomorrow is refused with 400`() {
        val clientToday = LocalDate.now()
        val oats = createFood("Rolled oats")

        val dayAfterTomorrow = clientToday.plusDays(2)

        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$dayAfterTomorrow","foodId":$oats,"grams":60.0,"clientToday":"$clientToday"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a weighed Entry dated the client's tomorrow is logged when the client is a day ahead of the server`() {
        // Past the client's midnight but not the server's: the client's tomorrow is
        // two days past the server's date, and the client's day is the one honoured.
        val clientToday = LocalDate.now().plusDays(1)
        val clientTomorrow = clientToday.plusDays(1)
        val oats = createFood("Rolled oats")

        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$clientTomorrow","foodId":$oats,"grams":60.0,"clientToday":"$clientToday"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.loggedOn") { value("$clientTomorrow") }
        }
    }

    @Test
    fun `a weighed Entry with an implausible clientToday is refused with 400`() {
        // No real timezone puts the client two days ahead — a bad clock, not tomorrow.
        val clientToday = LocalDate.now().plusDays(2)
        val oats = createFood("Rolled oats")

        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$clientToday","foodId":$oats,"grams":60.0,"clientToday":"$clientToday"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `an estimated Entry dated after the client's tomorrow is refused with 400`() {
        val clientToday = LocalDate.now()
        val dayAfterTomorrow = clientToday.plusDays(2)

        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$dayAfterTomorrow","label":"Café dinner","calories":800.0,"protein":null,""" +
                """"clientToday":"$clientToday"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `an estimated Entry dated the client's tomorrow is logged on it, as an estimate`() {
        val clientToday = LocalDate.now()
        val clientTomorrow = clientToday.plusDays(1)

        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$clientTomorrow","label":"Café dinner","calories":800.0,"protein":null,""" +
                """"clientToday":"$clientToday"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.loggedOn") { value("$clientTomorrow") }
            jsonPath("$.label") { value("Café dinner") }
            jsonPath("$.isEstimate") { value(true) }
        }
    }

    @Test
    fun `an estimated Entry dated the client's tomorrow is logged when the client is a day ahead of the server`() {
        // Two days past the server's date, so only the client's day admits it.
        val clientToday = LocalDate.now().plusDays(1)
        val clientTomorrow = clientToday.plusDays(1)

        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$clientTomorrow","label":"Café dinner","calories":800.0,"protein":null,""" +
                """"clientToday":"$clientToday"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.loggedOn") { value("$clientTomorrow") }
        }
    }

    @Test
    fun `an estimated Entry with an implausible clientToday is refused with 400`() {
        val clientToday = LocalDate.now().plusDays(2)

        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$clientToday","label":"Café dinner","calories":800.0,"protein":null,""" +
                """"clientToday":"$clientToday"}"""
        }.andExpect { status { isBadRequest() } }
    }
}
