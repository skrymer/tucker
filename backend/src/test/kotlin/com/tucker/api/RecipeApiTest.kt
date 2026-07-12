package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.Matchers.closeTo
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
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

    /** Build a create-recipe request body from `foodId to grams` ingredient pairs. */
    private fun recipeBody(name: String, cookedWeightG: Double, vararg ingredients: Pair<Long, Double>): String {
        val lines = ingredients.joinToString(",") { (id, grams) -> """{"foodId":$id,"grams":$grams}""" }
        return """{"name":"$name","cookedWeightG":$cookedWeightG,"ingredients":[$lines]}"""
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
    fun `creating a recipe reports its ingredient count`() {
        val minceId = createFood("Mince", 20.0, 0.0, 10.0)
        val onionId = createFood("Onion", 1.0, 9.0, 0.0)

        mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = recipeBody("Cottage Pie", 250.0, minceId to 300.0, onionId to 100.0)
        }.andExpect {
            status { isCreated() }
            jsonPath("$.ingredientCount") { value(2) }
        }
    }

    @Test
    fun `the foods catalog carries the ingredient count for recipes and null for plain foods`() {
        val minceId = createFood("Mince", 20.0, 0.0, 10.0)
        val onionId = createFood("Onion", 1.0, 9.0, 0.0)
        val recipeJson = mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = recipeBody("Cottage Pie", 250.0, minceId to 300.0, onionId to 100.0)
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val recipeId = objectMapper.readTree(recipeJson).get("id").asLong()

        val listJson = mockMvc.get("/api/foods")
            .andExpect { status { isOk() } }.andReturn().response.contentAsString
        val rows = objectMapper.readTree(listJson)
        val recipeRow = rows.first { it.get("id").asLong() == recipeId }
        val foodRow = rows.first { it.get("id").asLong() == minceId }

        assertEquals(2, recipeRow.get("ingredientCount").asInt())
        assertTrue(foodRow.get("ingredientCount").isNull, "a plain Food carries no ingredient count")
    }

    @Test
    fun `getting a recipe by id returns its ingredient lines and cooked weight`() {
        val minceId = createFood("Mince", protein = 20.0, carbs = 0.0, fat = 10.0)
        val onionId = createFood("Onion", protein = 1.0, carbs = 9.0, fat = 0.0)

        val recipeJson = mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = recipeBody("Cottage Pie", 250.0, minceId to 300.0, onionId to 100.0)
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val recipeId = objectMapper.readTree(recipeJson).get("id").asLong()

        mockMvc.get("/api/recipes/$recipeId").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(recipeId) }
            jsonPath("$.name") { value("Cottage Pie") }
            jsonPath("$.cookedWeightG") { value(250.0) }
            // Ingredient lines in insertion order, each name + grams for the read-only view.
            jsonPath("$.ingredients.length()") { value(2) }
            jsonPath("$.ingredients[0].foodId") { value(minceId) }
            jsonPath("$.ingredients[0].name") { value("Mince") }
            jsonPath("$.ingredients[0].grams") { value(300.0) }
            jsonPath("$.ingredients[1].name") { value("Onion") }
            jsonPath("$.ingredients[1].grams") { value(100.0) }
        }
    }

    @Test
    fun `getting a recipe by the id of a plain Food 404s`() {
        val foodId = createFood("Beef", 20.0, 0.0, 10.0)
        mockMvc.get("/api/recipes/$foodId").andExpect { status { isNotFound() } }
    }

    @Test
    fun `getting a recipe by an unknown id 404s`() {
        mockMvc.get("/api/recipes/999999").andExpect { status { isNotFound() } }
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

    /** Create a recipe via the public API and return its (Food) id. */
    private fun createRecipe(name: String, cookedWeightG: Double, vararg ingredients: Pair<Long, Double>): Long {
        val json = mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = recipeBody(name, cookedWeightG, *ingredients)
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(json).get("id").asLong()
    }

    @Test
    fun `updating a recipe keeps its Food id, re-rolls per 100g, and replaces its ingredient lines`() {
        val minceId = createFood("Mince", protein = 20.0, carbs = 0.0, fat = 10.0) // 170 kcal /100g
        val onionId = createFood("Onion", protein = 1.0, carbs = 9.0, fat = 0.0) // 40 kcal /100g

        // Original: 300 g mince = 510 kcal, 60 g protein, over a 250 g dish.
        val recipeId = createRecipe("Stew", 250.0, minceId to 300.0)

        // Recalibrate: add onion and cook down to 200 g.
        // Batch now 510 + (40 × 1) = 550 kcal, 60 + 1 = 61 g protein.
        // Over 200 g: 550/200×100 = 275 kcal, 61/200×100 = 30.5 g protein /100g.
        mockMvc.put("/api/recipes/$recipeId") {
            contentType = MediaType.APPLICATION_JSON
            content = recipeBody("Stew", 200.0, minceId to 300.0, onionId to 100.0)
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(recipeId) }
            jsonPath("$.kind") { value("RECIPE") }
            jsonPath("$.cookedWeightG") { value(200.0) }
            jsonPath("$.caloriesPer100g", closeTo(275.0, 0.1))
            jsonPath("$.proteinPer100g", closeTo(30.5, 0.1))
            jsonPath("$.ingredientCount") { value(2) }
        }

        // The stored composition reflects the replaced lines, not the original single line.
        mockMvc.get("/api/recipes/$recipeId").andExpect {
            status { isOk() }
            jsonPath("$.cookedWeightG") { value(200.0) }
            jsonPath("$.ingredients.length()") { value(2) }
            jsonPath("$.ingredients[0].name") { value("Mince") }
            jsonPath("$.ingredients[0].grams") { value(300.0) }
            jsonPath("$.ingredients[1].name") { value("Onion") }
            jsonPath("$.ingredients[1].grams") { value(100.0) }
        }
    }

    @Test
    fun `editing a recipe leaves already-logged Entries unchanged but new logs use the new density`() {
        val minceId = createFood("Mince", protein = 20.0, carbs = 0.0, fat = 10.0) // 170 kcal /100g
        // 200 g mince = 340 kcal over a 200 g dish → 170 kcal /100g.
        val recipeId = createRecipe("Bolognese", 200.0, minceId to 200.0)

        // Log 100 g of the finished dish: 170 kcal is snapshotted onto the Entry.
        val entryJson = mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-01-01","foodId":$recipeId,"grams":100.0}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.calories", closeTo(170.0, 0.1))
        }.andReturn().response.contentAsString
        val entryId = objectMapper.readTree(entryJson).get("id").asLong()

        // Recalibrate: same ingredients, cooked down to 100 g → density doubles to 340 kcal /100g.
        mockMvc.put("/api/recipes/$recipeId") {
            contentType = MediaType.APPLICATION_JSON
            content = recipeBody("Bolognese", 100.0, minceId to 200.0)
        }.andExpect {
            status { isOk() }
            jsonPath("$.caloriesPer100g", closeTo(340.0, 0.1))
        }

        // History is safe: the earlier Entry keeps its 170 kcal snapshot after the edit.
        val listJson = mockMvc.get("/api/entries") { param("date", "2026-01-01") }
            .andExpect { status { isOk() } }.andReturn().response.contentAsString
        val logged = objectMapper.readTree(listJson).first { it.get("id").asLong() == entryId }
        assertEquals(170.0, logged.get("calories").asDouble(), 0.1)

        // A fresh log of the same 100 g portion now uses the new density: 340 kcal.
        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-01-02","foodId":$recipeId,"grams":100.0}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.calories", closeTo(340.0, 0.1))
        }
    }

    @Test
    fun `updating a plain Food's id through the recipe endpoint 404s`() {
        val foodId = createFood("Beef", 20.0, 0.0, 10.0)
        mockMvc.put("/api/recipes/$foodId") {
            contentType = MediaType.APPLICATION_JSON
            content = recipeBody("Nope", 100.0, foodId to 100.0)
        }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `updating an unknown recipe id 404s`() {
        val foodId = createFood("Beef", 20.0, 0.0, 10.0)
        mockMvc.put("/api/recipes/999999") {
            contentType = MediaType.APPLICATION_JSON
            content = recipeBody("Ghost", 100.0, foodId to 100.0)
        }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `updating a recipe with no ingredients is rejected with 400`() {
        val foodId = createFood("Beef", 20.0, 0.0, 10.0)
        val recipeId = createRecipe("Base", 200.0, foodId to 300.0)
        mockMvc.put("/api/recipes/$recipeId") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Base","cookedWeightG":200.0,"ingredients":[]}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `updating a recipe to a non-positive cooked weight is rejected with 400`() {
        val foodId = createFood("Beef", 20.0, 0.0, 10.0)
        val recipeId = createRecipe("Base", 200.0, foodId to 300.0)
        mockMvc.put("/api/recipes/$recipeId") {
            contentType = MediaType.APPLICATION_JSON
            content = recipeBody("Base", 0.0, foodId to 300.0)
        }.andExpect { status { isBadRequest() } }
    }
}
