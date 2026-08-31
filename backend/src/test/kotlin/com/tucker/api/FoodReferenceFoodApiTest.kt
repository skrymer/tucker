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
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional

/**
 * `PUT` and `DELETE /api/foods/{id}/reference-food` — a User claiming, and taking
 * back, the borrow a **Food** makes of a **Reference Food**'s micronutrients
 * (ADR 0027).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class FoodReferenceFoodApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var referenceFoods: ReferenceFoodRepository

    @Test
    fun `a matched Food says which Reference Food it borrows from`() {
        val foodId = createFood("Tasty cheese")
        val cheddar = referenceFood("Tasty cheese")

        mockMvc.put("/api/foods/$foodId/reference-food") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"referenceFoodId":${cheddar.first}}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.referenceFoodId") { value(cheddar.first) }
            jsonPath("$.referenceFoodName") { value(cheddar.second) }
        }

        mockMvc.get("/api/foods/$foodId").andExpect {
            status { isOk() }
            jsonPath("$.referenceFoodId") { value(cheddar.first) }
            jsonPath("$.referenceFoodName") { value(cheddar.second) }
        }
    }

    @Test
    fun `unmatching a Food leaves it borrowing nothing`() {
        val foodId = createFood("Tasty cheese")
        match(foodId, referenceFood("Tasty cheese").first)

        mockMvc.delete("/api/foods/$foodId/reference-food").andExpect {
            status { isNoContent() }
        }

        mockMvc.get("/api/foods/$foodId").andExpect {
            status { isOk() }
            jsonPath("$.referenceFoodId") { value(null) }
            jsonPath("$.referenceFoodName") { value(null) }
        }
    }

    @Test
    fun `a Recipe cannot be matched, because it rolls its micronutrients up instead`() {
        val recipeId = createRecipe("Bolognese", ingredientId = createFood("Beef mince"))

        mockMvc.put("/api/foods/$recipeId/reference-food") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"referenceFoodId":${referenceFood("Tasty cheese").first}}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value(org.hamcrest.Matchers.containsString("Recipe")) }
        }
    }

    @Test
    fun `the catalog names what each matched Food borrows from, and marks the rest not at all`() {
        val cheese = createFood("Tasty cheese")
        createFood("Zucchini slice")
        val cheddar = referenceFood("Tasty cheese")
        match(cheese, cheddar.first)

        mockMvc.get("/api/foods").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].name") { value("Tasty cheese") }
            jsonPath("$[0].referenceFoodId") { value(cheddar.first) }
            jsonPath("$[0].referenceFoodName") { value(cheddar.second) }
            jsonPath("$[1].name") { value("Zucchini slice") }
            jsonPath("$[1].referenceFoodId") { value(null) }
            jsonPath("$[1].referenceFoodName") { value(null) }
        }
    }

    @Test
    fun `a matched Food found by its barcode still says what it borrows from`() {
        val foodId = createFood("Tasty cheese", barcode = "9300601234567")
        val cheddar = referenceFood("Tasty cheese")
        match(foodId, cheddar.first)

        mockMvc.get("/api/foods/barcode/9300601234567").andExpect {
            status { isOk() }
            jsonPath("$.outcome") { value("EXISTING") }
            jsonPath("$.food.referenceFoodId") { value(cheddar.first) }
            jsonPath("$.food.referenceFoodName") { value(cheddar.second) }
        }
    }

    @Test
    fun `matching a Food that does not exist answers as a foreign one does`() {
        mockMvc.put("/api/foods/999999/reference-food") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"referenceFoodId":${referenceFood("Tasty cheese").first}}"""
        }.andExpect { status { isNotFound() } }

        mockMvc.delete("/api/foods/999999/reference-food").andExpect {
            status { isNoContent() }
        }
    }

    @Test
    fun `matching to a Reference Food the database does not hold is not found`() {
        val foodId = createFood("Tasty cheese")

        mockMvc.put("/api/foods/$foodId/reference-food") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"referenceFoodId":999999}"""
        }.andExpect { status { isNotFound() } }

        mockMvc.get("/api/foods/$foodId").andExpect {
            jsonPath("$.referenceFoodId") { value(null) }
        }
    }

    private fun createRecipe(name: String, ingredientId: Long): Long {
        val body = mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","cookedWeightG":500.0,
                          "ingredients":[{"foodId":$ingredientId,"grams":600.0}]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(body).get("id").asLong()
    }

    private fun match(foodId: Long, referenceFoodId: Long) {
        mockMvc.put("/api/foods/$foodId/reference-food") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"referenceFoodId":$referenceFoodId}"""
        }.andExpect { status { isOk() } }
    }

    private fun createFood(name: String, barcode: String? = null): Long {
        val body = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","barcode":${barcode?.let { "\"$it\"" }},
                          "proteinPer100g":25.0,"carbsPer100g":0.0,"fatPer100g":33.0}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(body).get("id").asLong()
    }

    /** The id and name of the best Reference Food for [text], as the picker would offer it. */
    private fun referenceFood(text: String): Pair<Long, String> {
        val best = referenceFoods
            .search(ReferenceFoodQuery.of(text, referenceFoods.synonyms()), limit = 1)
            .first().food
        return best.id to best.name
    }
}
