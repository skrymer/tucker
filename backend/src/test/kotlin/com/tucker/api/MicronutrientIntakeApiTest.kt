package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.domain.ReferenceFoodQuery
import com.tucker.persistence.ReferenceFoodRepository
import com.tucker.security.WithTuckerUser
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

/**
 * `GET /api/micronutrient-intake?from=&to=` — how much of a window's food could
 * supply a vitamin or mineral figure at all, and what is left to match (ADR 0027).
 * No nutrient figures in this slice.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class MicronutrientIntakeApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var referenceFoods: ReferenceFoodRepository

    private val day = LocalDate.of(2026, 8, 27)

    @Test
    fun `the window states its coverage and ranks what is left to match`() {
        // Protein alone, so 100 g is 4x25 = 100 kcal and every figure below is exact —
        // a sum of thirds would only be asserting how doubles round.
        val cheese = createFood("Tasty cheese")
        val rice = createFood("Jasmine rice")
        val oats = createFood("Rolled oats")
        match(cheese, referenceFoodFor("Tasty cheese"))
        logWeighed(cheese, grams = 200.0)
        logWeighed(rice, grams = 100.0)
        logWeighed(oats, grams = 50.0)

        mockMvc.get("/api/micronutrient-intake") {
            param("from", "$day")
            param("to", "$day")
        }.andExpect {
            status { isOk() }
            jsonPath("$.from") { value("$day") }
            jsonPath("$.to") { value("$day") }
            jsonPath("$.totalCalories") { value(350.0) }
            jsonPath("$.coverage") { value(200.0 / 350.0) }
            jsonPath("$.unmatched.length()") { value(2) }
            jsonPath("$.unmatched[0].name") { value("Jasmine rice") }
            jsonPath("$.unmatched[0].foodId") { value(rice) }
            jsonPath("$.unmatched[0].calories") { value(100.0) }
            jsonPath("$.unmatched[0].share") { value(100.0 / 350.0) }
            jsonPath("$.unmatched[1].name") { value("Rolled oats") }
        }
    }

    private fun referenceFoodFor(text: String): Long =
        referenceFoods.search(ReferenceFoodQuery.of(text, referenceFoods.synonyms()), limit = 1)
            .first().food.id

    private fun createFood(name: String): Long {
        val body = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","proteinPer100g":25.0,"carbsPer100g":0.0,"fatPer100g":0.0}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(body).get("id").asLong()
    }

    private fun match(foodId: Long, referenceFoodId: Long) {
        mockMvc.put("/api/foods/$foodId/reference-food") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"referenceFoodId":$referenceFoodId}"""
        }.andExpect { status { isOk() } }
    }

    private fun logWeighed(foodId: Long, grams: Double) {
        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"$day","foodId":$foodId,"grams":$grams}"""
        }.andExpect { status { isCreated() } }
    }
}
