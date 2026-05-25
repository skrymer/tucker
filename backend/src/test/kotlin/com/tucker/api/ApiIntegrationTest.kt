package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ApiIntegrationTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    @Test
    fun `create a food, log it, and see it in the daily summary`() {
        val foodJson = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Banana","caloriesPer100g":89.0,"proteinPer100g":1.1,
                          "carbsPer100g":22.8,"fatPer100g":0.3}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val foodId = objectMapper.readTree(foodJson).get("id").asLong()

        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-05-22","foodId":$foodId,"grams":120.0}"""
        }.andExpect { status { isCreated() } }

        mockMvc.get("/api/summary") { param("date", "2026-05-22") }.andExpect {
            status { isOk() }
            jsonPath("$.entries.length()") { value(1) }
            jsonPath("$.entries[0].foodName") { value("Banana") }
            jsonPath("$.caloriesConsumed") { exists() }
        }
    }

    @Test
    fun `an invalid food is rejected with 400`() {
        mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Bad","caloriesPer100g":-5.0,"proteinPer100g":1.0}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `an unknown food id is rejected with 404`() {
        mockMvc.get("/api/foods/999999").andExpect { status { isNotFound() } }
    }
}
