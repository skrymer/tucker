package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.security.WithTuckerUser
import org.hamcrest.Matchers.contains
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

/** The **Tags** a Recipe carries, set while building or editing it (ADR 0033). */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class RecipeTagsApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    @Test
    fun `a Recipe created with Tags carries them from the start`() {
        val mince = createFood("Beef mince")
        val dinner = createTag("dinner")
        val batch = createTag("Batch cook")

        val created = objectMapper.readTree(
            mockMvc.post("/api/recipes") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Bolognese","cookedWeightG":500.0,"tagIds":[$dinner,$batch],
                              "ingredients":[{"foodId":$mince,"grams":600.0}]}"""
            }.andExpect {
                status { isCreated() }
                jsonPath("$.tags.length()") { value(2) }
            }.andReturn().response.contentAsString,
        )["id"].asLong()

        mockMvc.get("/api/foods/$created").andExpect {
            jsonPath("$.tags.length()") { value(2) }
            jsonPath("$.tags[0].id") { value(batch) }
            jsonPath("$.tags[0].name") { value("Batch cook") }
            jsonPath("$.tags[1].id") { value(dinner) }
            jsonPath("$.tags[1].name") { value("dinner") }
        }
    }

    @Test
    fun `a Recipe created with a Tag id the User does not have is refused as absent, and not created`() {
        val mince = createFood("Beef mince")
        val dinner = createTag("dinner")

        mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Bolognese","cookedWeightG":500.0,"tagIds":[$dinner,999999],
                          "ingredients":[{"foodId":$mince,"grams":600.0}]}"""
        }.andExpect {
            status { isNotFound() }
        }

        mockMvc.get("/api/foods").andExpect {
            jsonPath("$[*].name") { value(contains("Beef mince")) }
        }
    }

    @Test
    fun `editing a Recipe replaces its Tags with the ones sent, as it replaces its ingredients`() {
        val mince = createFood("Beef mince")
        val dinner = createTag("dinner")
        val batch = createTag("Batch cook")
        val freezer = createTag("freezer")
        val recipe = createRecipe(mince, dinner, batch)

        mockMvc.put("/api/recipes/$recipe") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Bolognese","cookedWeightG":450.0,"tagIds":[$dinner,$freezer],
                          "ingredients":[{"foodId":$mince,"grams":600.0}]}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.tags.length()") { value(2) }
        }

        mockMvc.get("/api/foods/$recipe").andExpect {
            jsonPath("$.tags[*].id") { value(contains(dinner.toInt(), freezer.toInt())) }
        }
    }

    @Test
    fun `an edit naming a Tag id the User does not have is refused as absent, and the Recipe is left as it was`() {
        val mince = createFood("Beef mince")
        val onion = createFood("Onion")
        val dinner = createTag("dinner")
        val recipe = createRecipe(mince, dinner)

        mockMvc.put("/api/recipes/$recipe") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Bolognese","cookedWeightG":450.0,"tagIds":[$dinner,999999],
                          "ingredients":[{"foodId":$mince,"grams":600.0},{"foodId":$onion,"grams":100.0}]}"""
        }.andExpect {
            status { isNotFound() }
        }

        mockMvc.get("/api/foods/$recipe").andExpect {
            jsonPath("$.tags[*].id") { value(contains(dinner.toInt())) }
        }
        mockMvc.get("/api/recipes/$recipe").andExpect {
            jsonPath("$.cookedWeightG") { value(500.0) }
            jsonPath("$.ingredients[*].name") { value(contains("Beef mince")) }
        }
    }

    @Test
    fun `a Recipe read for editing carries its Tags beside its composition`() {
        val mince = createFood("Beef mince")
        val dinner = createTag("dinner")
        val batch = createTag("Batch cook")
        val recipe = createRecipe(mince, dinner, batch)

        mockMvc.get("/api/recipes/$recipe").andExpect {
            status { isOk() }
            jsonPath("$.tags[*].name") { value(contains("Batch cook", "dinner")) }
            jsonPath("$.tags[*].id") { value(contains(batch.toInt(), dinner.toInt())) }
        }
    }

    private fun createRecipe(ingredient: Long, vararg tagIds: Long): Long {
        val body = mockMvc.post("/api/recipes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Bolognese","cookedWeightG":500.0,"tagIds":[${tagIds.joinToString(",")}],
                          "ingredients":[{"foodId":$ingredient,"grams":600.0}]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(body).get("id").asLong()
    }

    private fun createFood(name: String): Long {
        val body = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","barcode":null,
                          "proteinPer100g":20.0,"carbsPer100g":0.0,"fatPer100g":10.0}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(body).get("id").asLong()
    }

    private fun createTag(name: String): Long {
        val body = mockMvc.post("/api/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name"}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return objectMapper.readTree(body).get("id").asLong()
    }
}
