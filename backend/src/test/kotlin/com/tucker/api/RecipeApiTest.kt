package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
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

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RecipeApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    /** Create a plain Food via the public API and return its id. */
    private fun createFood(name: String, protein: Double, carbs: Double, fat: Double): Long {
        val json = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","proteinPer100g":$protein,"carbsPer100g":$carbs,"fatPer100g":$fat}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(json).get("id").asLong()
    }

    @Test
    fun `creating a recipe returns the rolled-up per 100g of the cooked weight`() {
        // Mince: 4*20 + 9*10 = 170 kcal /100g. 300 g → 510 kcal, 60 g protein.
        // Over a 200 g finished dish: 510/200*100 = 255 kcal, 60/200*100 = 30 g protein /100g.
        val minceId = createFood("Mince", protein = 20.0, carbs = 0.0, fat = 10.0)

        mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """{"name":"Cottage Pie","cookedWeightG":200.0,"ingredients":[{"foodId":$minceId,"grams":300.0}]}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.name") { value("Cottage Pie") }
            jsonPath("$.kind") { value("RECIPE") }
            jsonPath("$.cookedWeightG") { value(200.0) }
            jsonPath("$.caloriesPer100g", closeTo(255.0, 0.1))
            jsonPath("$.proteinPer100g", closeTo(30.0, 0.1))
        }
    }

    @Test
    fun `a created recipe appears in the foods catalog as a RECIPE`() {
        val minceId = createFood("Beef", protein = 20.0, carbs = 0.0, fat = 10.0)

        val recipeJson = mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Ragu","cookedWeightG":400.0,"ingredients":[{"foodId":$minceId,"grams":500.0}]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val recipeId = objectMapper.readTree(recipeJson).get("id").asLong()

        mockMvc.get("/api/foods/$recipeId").andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Ragu") }
            jsonPath("$.kind") { value("RECIPE") }
        }
    }

    @Test
    fun `a blank name is rejected with 400`() {
        val foodId = createFood("Beef", 20.0, 0.0, 10.0)
        mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"  ","cookedWeightG":200.0,"ingredients":[{"foodId":$foodId,"grams":300.0}]}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a recipe with no ingredients is rejected with 400`() {
        mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Empty","cookedWeightG":200.0,"ingredients":[]}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a non-positive ingredient weight is rejected with 400`() {
        val foodId = createFood("Beef", 20.0, 0.0, 10.0)
        mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Bad","cookedWeightG":200.0,"ingredients":[{"foodId":$foodId,"grams":0.0}]}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a non-positive cooked weight is rejected with 400`() {
        val foodId = createFood("Beef", 20.0, 0.0, 10.0)
        mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Bad","cookedWeightG":0.0,"ingredients":[{"foodId":$foodId,"grams":300.0}]}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a recipe cannot be used as an ingredient of another recipe`() {
        val foodId = createFood("Beef", 20.0, 0.0, 10.0)
        val recipeJson = mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """{"name":"Base","cookedWeightG":200.0,"ingredients":[{"foodId":$foodId,"grams":300.0}]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val recipeId = objectMapper.readTree(recipeJson).get("id").asLong()

        // Nesting a RECIPE as an ingredient is rejected — v1 allows plain Foods only.
        mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """{"name":"Nested","cookedWeightG":200.0,"ingredients":[{"foodId":$recipeId,"grams":100.0}]}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `an unknown ingredient food id is rejected with 400`() {
        mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Ghost","cookedWeightG":200.0,"ingredients":[{"foodId":999999,"grams":300.0}]}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value(org.hamcrest.Matchers.containsString("999999")) }
        }
    }
}
