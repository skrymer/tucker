package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.security.WithTuckerUser
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
 * `GET /api/intake-breakdown` — the Intake Breakdown (ADR 0026) over a window the
 * client supplies (ADR 0014), both bounds inclusive.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class IntakeBreakdownApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    private val day = LocalDate.of(2026, 8, 27)

    private fun idOf(json: String): Long = objectMapper.readTree(json).get("id").asLong()

    private fun createFood(name: String, proteinPer100g: Double = 31.0): Long {
        val body = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","proteinPer100g":$proteinPer100g,
                          "carbsPer100g":0.0,"fatPer100g":3.6}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return idOf(body)
    }

    private fun logWeighed(foodId: Long, grams: Double, on: LocalDate = day) {
        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","foodId":$foodId,"grams":$grams}"""
        }.andExpect { status { isCreated() } }
    }

    private fun logEstimated(label: String, calories: Double, protein: Double?, on: LocalDate = day) {
        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$on","label":"$label","calories":$calories,"protein":$protein}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `the window's slices are returned biggest first, with the window and its totals`() {
        // 100 g of chicken: 4x31 + 9x3.6 = 156.4 kcal, 31 g protein.
        val chicken = createFood("Chicken breast")
        logWeighed(chicken, grams = 200.0)
        logEstimated("Work canteen", calories = 640.0, protein = null)

        mockMvc.get("/api/intake-breakdown") {
            param("from", "$day")
            param("to", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.from") { value("$day") }
            jsonPath("$.to") { value("$day") }
            jsonPath("$.totalCalories") { value(952.8) }
            jsonPath("$.loggedDays") { value(1) }
            jsonPath("$.items.length()") { value(2) }
            jsonPath("$.items[0].name") { value("Work canteen") }
            jsonPath("$.items[0].foodId") { value(null) }
            jsonPath("$.items[0].calories") { value(640.0) }
            jsonPath("$.items[0].protein") { value(null) }
            jsonPath("$.items[0].isEstimate") { value(true) }
            jsonPath("$.items[1].name") { value("Chicken breast") }
            jsonPath("$.items[1].foodId") { value(chicken) }
            jsonPath("$.items[1].calories") { value(312.8) }
            jsonPath("$.items[1].protein") { value(62.0) }
            jsonPath("$.items[1].isEstimate") { value(false) }
        }
    }

    @Test
    fun `both window bounds are inclusive and an Entry outside them is left out`() {
        logEstimated("Day before", calories = 100.0, protein = null, on = day.minusDays(3))
        logEstimated("First day", calories = 200.0, protein = null, on = day.minusDays(2))
        logEstimated("Last day", calories = 300.0, protein = null, on = day)
        logEstimated("Day after", calories = 400.0, protein = null, on = day.plusDays(1))

        mockMvc.get("/api/intake-breakdown") {
            param("from", "${day.minusDays(2)}")
            param("to", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.totalCalories") { value(500.0) }
            jsonPath("$.items.length()") { value(2) }
            jsonPath("$.items[0].name") { value("Last day") }
            jsonPath("$.items[1].name") { value("First day") }
        }
    }

    @Test
    fun `a Recipe is one slice under its own name, never its ingredients`() {
        val mince = createFood("Beef mince", proteinPer100g = 26.0)
        val potato = createFood("Potato", proteinPer100g = 2.0)
        val pie = mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Cottage pie","cookedWeightG":600.0,
                          "ingredients":[{"foodId":$mince,"grams":400.0},
                                         {"foodId":$potato,"grams":300.0}]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val pieId = idOf(pie)

        logWeighed(pieId, grams = 300.0)

        mockMvc.get("/api/intake-breakdown") {
            param("from", "$day")
            param("to", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.items.length()") { value(1) }
            jsonPath("$.items[0].name") { value("Cottage pie") }
            jsonPath("$.items[0].foodId") { value(pieId) }
            jsonPath("$.items[0].share") { value(1.0) }
        }
    }

    @Test
    fun `a window with nothing logged is an empty breakdown rather than a not-found`() {
        mockMvc.get("/api/intake-breakdown") {
            param("from", "$day")
            param("to", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.items") { isEmpty() }
            jsonPath("$.totalCalories") { value(0.0) }
            jsonPath("$.loggedDays") { value(0) }
        }
    }
}
