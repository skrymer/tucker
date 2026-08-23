package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.Matchers.closeTo
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional

/**
 * The API's happy paths end to end, over a real MockMvc and a real database.
 *
 * **Not every response field is asserted, deliberately.** A handful of accessors on
 * `GoalResponse`, `WeeklyReviewResponse`, `FoodResponse`, `GoalProgressResponse` and
 * `DailySummaryResponse` carry a figure no test reads back, and mutation testing
 * reports each as a survivor. Asserting them would pin *field wiring* — that a
 * constructor argument reached the JSON — rather than behaviour, which is the shape
 * ADR 0013 leaves to the integrated layer. A field is asserted here when something
 * *derives* it (an Entry's calories and protein, a summary's remaining figures, a
 * Recipe's ingredient count), because then the assertion is about the derivation.
 * The full list, and the verdict on each, is in
 * `.claude/skills/mutation-test/references/known-survivors.md`.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ApiIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    @Test
    fun `create a food, log it, and see it in the daily summary`() {
        // Banana: 1.1P + 22.8C + 0.3F → 4 * 1.1 + 4 * 22.8 + 9 * 0.3 = 98.3 kcal /100g
        val foodJson = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Banana","proteinPer100g":1.1,"carbsPer100g":22.8,"fatPer100g":0.3}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.caloriesPer100g", closeTo(98.3, 1e-6))
        }.andReturn().response.contentAsString
        val foodId = objectMapper.readTree(foodJson).get("id").asLong()

        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-05-22","foodId":$foodId,"grams":120.0}"""
        }.andExpect { status { isCreated() } }

        mockMvc.get("/api/summary") { param("date", "2026-05-22") }.andExpect {
            status { isOk() }
            jsonPath("$.entries.length()") { value(1) }
            // The whole row, not just the name: 120 g of a 98.3 kcal / 1.1 g
            // protein per-100 g Banana. An Entry reads by its protein as well as
            // its calories, and the weighed pair is what the client renders it from.
            jsonPath("$.entries[0].foodName") { value("Banana") }
            jsonPath("$.entries[0].foodId") { value(foodId) }
            jsonPath("$.entries[0].kind") { value("WEIGHED") }
            jsonPath("$.entries[0].isEstimate") { value(false) }
            jsonPath("$.entries[0].grams") { value(120.0) }
            jsonPath("$.entries[0].calories", closeTo(117.96, 1e-6))
            jsonPath("$.entries[0].protein", closeTo(1.32, 1e-6))
            jsonPath("$.caloriesConsumed", closeTo(117.96, 1e-6))
        }
    }

    @Test
    fun `an invalid food is rejected with 400`() {
        mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Bad","proteinPer100g":-1.0,"carbsPer100g":0.0,"fatPer100g":0.0}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `an unknown food id is rejected with 404`() {
        mockMvc.get("/api/foods/999999").andExpect { status { isNotFound() } }
    }

    @Test
    fun `deleting a food that has logged entries is rejected by the domain`() {
        val foodJson = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Skyr","proteinPer100g":11.0,"carbsPer100g":4.0,"fatPer100g":0.2}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val foodId = objectMapper.readTree(foodJson).get("id").asLong()

        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-05-22","foodId":$foodId,"grams":150.0}"""
        }.andExpect { status { isCreated() } }

        mockMvc.delete("/api/foods/$foodId").andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value(org.hamcrest.Matchers.containsString("Skyr")) }
        }

        // The Food is permanent history's anchor: it and the Entry both survive.
        mockMvc.get("/api/foods/$foodId").andExpect { status { isOk() } }
        mockMvc.get("/api/summary") { param("date", "2026-05-22") }.andExpect {
            status { isOk() }
            jsonPath("$.entries.length()") { value(1) }
        }
    }

    @Test
    fun `deleting a food with no logged entries removes it`() {
        val foodJson = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Unlogged","proteinPer100g":1.0,"carbsPer100g":1.0,"fatPer100g":1.0}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val foodId = objectMapper.readTree(foodJson).get("id").asLong()

        mockMvc.delete("/api/foods/$foodId").andExpect { status { isNoContent() } }
        mockMvc.get("/api/foods/$foodId").andExpect { status { isNotFound() } }
    }

    @Test
    fun `deleting your own entry takes it off the day`() {
        // Deleting is idempotent, so 204 is also what an id nobody owns gets — the
        // status alone cannot tell a delete that happened from one that did not.
        // Only the day it came off can.
        val entryJson = mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-05-22","label":"Cafe lunch","calories":600.0,"protein":30.0}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val entryId = objectMapper.readTree(entryJson).get("id").asLong()

        mockMvc.get("/api/summary") { param("date", "2026-05-22") }
            .andExpect { jsonPath("$.entries.length()") { value(1) } }

        mockMvc.delete("/api/entries/$entryId").andExpect { status { isNoContent() } }

        mockMvc.get("/api/summary") { param("date", "2026-05-22") }.andExpect {
            jsonPath("$.entries.length()") { value(0) }
            jsonPath("$.caloriesConsumed") { value(0.0) }
        }
    }
}
