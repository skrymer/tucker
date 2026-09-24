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

/** `PUT /api/foods/{id}/tags` — which **Tags** a Food carries (ADR 0033). */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class FoodTagsApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var referenceFoods: ReferenceFoodRepository

    @Test
    fun `a Food given Tags carries them, alphabetically`() {
        val oats = createFood("Rolled oats")
        val snack = createTag("snack")
        val breakfast = createTag("Breakfast")

        mockMvc.put("/api/foods/$oats/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"tagIds":[$snack,$breakfast]}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.tags.length()") { value(2) }
        }

        mockMvc.get("/api/foods/$oats").andExpect {
            status { isOk() }
            jsonPath("$.tags.length()") { value(2) }
            jsonPath("$.tags[0].id") { value(breakfast) }
            jsonPath("$.tags[0].name") { value("Breakfast") }
            jsonPath("$.tags[1].id") { value(snack) }
            jsonPath("$.tags[1].name") { value("snack") }
        }
    }

    @Test
    fun `a Food created with Tags carries them from the start`() {
        val snack = createTag("snack")
        val breakfast = createTag("Breakfast")

        val created = objectMapper.readTree(
            mockMvc.post("/api/foods") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Rolled oats","barcode":null,"proteinPer100g":13.0,
                              "carbsPer100g":60.0,"fatPer100g":7.0,"tagIds":[$snack,$breakfast]}"""
            }.andExpect {
                status { isCreated() }
                jsonPath("$.tags.length()") { value(2) }
            }.andReturn().response.contentAsString,
        )["id"].asLong()

        mockMvc.get("/api/foods/$created").andExpect {
            jsonPath("$.tags.length()") { value(2) }
            jsonPath("$.tags[0].id") { value(breakfast) }
            jsonPath("$.tags[0].name") { value("Breakfast") }
            jsonPath("$.tags[1].id") { value(snack) }
            jsonPath("$.tags[1].name") { value("snack") }
        }
    }

    @Test
    fun `a Food created with a Tag id the User does not have is refused as absent, and not created`() {
        val snack = createTag("snack")

        mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Rolled oats","barcode":null,"proteinPer100g":13.0,
                          "carbsPer100g":60.0,"fatPer100g":7.0,"tagIds":[$snack,999999]}"""
        }.andExpect {
            status { isNotFound() }
        }

        mockMvc.get("/api/foods").andExpect {
            jsonPath("$.length()") { value(0) }
        }
    }

    @Test
    fun `a Tag id the User does not have is refused as absent, and the Food keeps its Tags`() {
        val oats = createFood("Rolled oats")
        val breakfast = createTag("breakfast")
        retag(oats, breakfast)

        mockMvc.put("/api/foods/$oats/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"tagIds":[$breakfast,999999]}"""
        }.andExpect {
            status { isNotFound() }
        }

        mockMvc.get("/api/foods/$oats").andExpect {
            jsonPath("$.tags.length()") { value(1) }
            jsonPath("$.tags[0].id") { value(breakfast) }
        }
    }

    @Test
    fun `a Recipe edited keeps the Tags it carries, and says so`() {
        val mince = createFood("Beef mince")
        val recipe = objectMapper.readTree(
            mockMvc.post("/api/recipes") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Bolognese","cookedWeightG":500.0,
                              "ingredients":[{"foodId":$mince,"grams":600.0}]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        ).get("id").asLong()
        val dinner = createTag("dinner")
        retag(recipe, dinner)

        mockMvc.put("/api/recipes/$recipe") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Bolognese","cookedWeightG":450.0,
                          "ingredients":[{"foodId":$mince,"grams":600.0}]}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.tags[0].id") { value(dinner) }
        }

        mockMvc.get("/api/foods/$recipe").andExpect {
            jsonPath("$.tags.length()") { value(1) }
            jsonPath("$.tags[0].name") { value("dinner") }
        }
    }

    @Test
    fun `deleting a Food deletes none of the Tags it carried`() {
        val oats = createFood("Rolled oats")
        val breakfast = createTag("breakfast")
        retag(oats, breakfast)

        mockMvc.delete("/api/foods/$oats").andExpect { status { isNoContent() } }

        mockMvc.get("/api/tags").andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(breakfast) }
            jsonPath("$[0].foodCount") { value(0) }
        }
    }

    @Test
    fun `the User's Tags are listed alphabetically ignoring case, each counting the Foods carrying it`() {
        val oats = createFood("Rolled oats")
        val eggs = createFood("Eggs")
        val snack = createTag("snack")
        val breakfast = createTag("Breakfast")
        createTag("dinner")
        retag(oats, breakfast)
        retag(eggs, breakfast, snack)

        mockMvc.get("/api/tags").andExpect {
            jsonPath("$[*].name") { value(org.hamcrest.Matchers.contains("Breakfast", "dinner", "snack")) }
            jsonPath("$[*].foodCount") { value(org.hamcrest.Matchers.contains(2, 0, 1)) }
        }
    }

    @Test
    fun `matching a Food to a Reference Food and taking it back keeps the Tags it carries`() {
        val cheese = createFood("Tasty cheese")
        val snack = createTag("snack")
        retag(cheese, snack)
        val cheddar = referenceFoods
            .search(ReferenceFoodQuery.of("cheddar", referenceFoods.synonyms()), limit = 1)
            .first().food.id

        mockMvc.put("/api/foods/$cheese/reference-food") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"referenceFoodId":$cheddar}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.tags[0].id") { value(snack) }
        }
        mockMvc.delete("/api/foods/$cheese/reference-food").andExpect { status { isNoContent() } }

        mockMvc.get("/api/foods/$cheese").andExpect {
            jsonPath("$.tags.length()") { value(1) }
            jsonPath("$.tags[0].id") { value(snack) }
        }
    }

    private fun retag(foodId: Long, vararg tagIds: Long) {
        mockMvc.put("/api/foods/$foodId/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"tagIds":[${tagIds.joinToString(",")}]}"""
        }.andExpect { status { isOk() } }
    }

    private fun createFood(name: String): Long {
        val body = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name","barcode":null,
                          "proteinPer100g":13.0,"carbsPer100g":60.0,"fatPer100g":7.0}"""
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
