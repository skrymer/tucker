package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
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

/** `/api/tags` — the **Tags** a User keeps of their own Foods (ADR 0033). */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class TagApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    @Test
    fun `a created Tag is among the User's Tags`() {
        mockMvc.post("/api/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"breakfast"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.name") { value("breakfast") }
        }

        mockMvc.get("/api/tags").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].name") { value("breakfast") }
            jsonPath("$[0].foodCount") { value(0) }
        }
    }

    @Test
    fun `creating a Tag the User already has in another case returns the one they have`() {
        val existing = createTag("breakfast")

        mockMvc.post("/api/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":" Breakfast "}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(existing) }
            jsonPath("$.name") { value("breakfast") }
        }

        mockMvc.get("/api/tags").andExpect {
            jsonPath("$.length()") { value(1) }
        }
    }

    @Test
    fun `a Tag reached by naming it again reports the Foods already carrying it`() {
        val breakfast = createTag("breakfast")
        val oats = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Rolled oats","barcode":null,
                          "proteinPer100g":13.0,"carbsPer100g":60.0,"fatPer100g":7.0,"tagIds":[]}"""
        }.andReturn().response.contentAsString.let(::idOf)
        tagFood(oats, breakfast)

        mockMvc.post("/api/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Breakfast"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.foodCount") { value(1) }
        }
    }

    @Test
    fun `a Tag name of whitespace alone is refused as a bad request, and nothing is created`() {
        mockMvc.post("/api/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"   "}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value(org.hamcrest.Matchers.containsString("blank")) }
        }

        mockMvc.get("/api/tags").andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `deleting a Tag takes it off every Food carrying it and deletes no Food`() {
        val breakfast = createTag("breakfast")
        val snack = createTag("snack")
        val oats = createFood("Rolled oats")
        tagFood(oats, breakfast, snack)

        mockMvc.delete("/api/tags/$breakfast").andExpect { status { isNoContent() } }

        mockMvc.get("/api/tags").andExpect {
            jsonPath("$[*].name") { value(org.hamcrest.Matchers.contains("snack")) }
        }
        mockMvc.get("/api/foods/$oats").andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Rolled oats") }
            jsonPath("$.tags[*].name") { value(org.hamcrest.Matchers.contains("snack")) }
        }
    }

    @Test
    fun `deleting a Tag that is already gone is no content, and deletes nothing else`() {
        val breakfast = createTag("breakfast")
        createTag("snack")
        mockMvc.delete("/api/tags/$breakfast").andExpect { status { isNoContent() } }

        mockMvc.delete("/api/tags/$breakfast").andExpect { status { isNoContent() } }

        mockMvc.get("/api/tags").andExpect {
            jsonPath("$[*].name") { value(org.hamcrest.Matchers.contains("snack")) }
        }
    }

    @Test
    fun `renaming a Tag answers with it under its new name, not merged`() {
        val breakfast = createTag("breakfast")
        val oats = createFood("Rolled oats")
        tagFood(oats, breakfast)

        rename(breakfast, " Morning ").andExpect {
            status { isOk() }
            jsonPath("$.merged") { value(false) }
            jsonPath("$.tag.id") { value(breakfast) }
            jsonPath("$.tag.name") { value("Morning") }
            jsonPath("$.tag.foodCount") { value(1) }
        }

        mockMvc.get("/api/foods/$oats").andExpect {
            jsonPath("$.tags[*].name") { value(org.hamcrest.Matchers.contains("Morning")) }
        }
    }

    @Test
    fun `renaming a Tag onto another's name answers with the Tag it merged into, carrying the Foods of both`() {
        val snack = createTag("Snack")
        val treats = createTag("treats")
        val apple = createFood("Apple")
        val biscuit = createFood("Biscuit")
        tagFood(apple, snack)
        tagFood(biscuit, snack, treats)
        tagFood(createFood("Chocolate"), treats)

        rename(treats, "SNACK").andExpect {
            status { isOk() }
            jsonPath("$.merged") { value(true) }
            jsonPath("$.tag.id") { value(snack) }
            jsonPath("$.tag.name") { value("Snack") }
            jsonPath("$.tag.foodCount") { value(3) }
        }

        mockMvc.get("/api/tags").andExpect {
            jsonPath("$[*].name") { value(org.hamcrest.Matchers.contains("Snack")) }
        }
        mockMvc.get("/api/foods/$biscuit").andExpect {
            jsonPath("$.tags[*].name") { value(org.hamcrest.Matchers.contains("Snack")) }
        }
    }

    @Test
    fun `renaming a Tag to a name over thirty characters is a bad request, and leaves it as it was`() {
        val breakfast = createTag("breakfast")

        rename(breakfast, "a".repeat(31)).andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value(org.hamcrest.Matchers.containsString("30")) }
        }

        mockMvc.get("/api/tags").andExpect {
            jsonPath("$[*].name") { value(org.hamcrest.Matchers.contains("breakfast")) }
        }
    }

    @Test
    fun `renaming a Tag to whitespace alone is a bad request, and leaves it as it was`() {
        val breakfast = createTag("breakfast")

        rename(breakfast, "   ").andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value(org.hamcrest.Matchers.containsString("blank")) }
        }

        mockMvc.get("/api/tags").andExpect {
            jsonPath("$[*].name") { value(org.hamcrest.Matchers.contains("breakfast")) }
        }
    }

    private fun rename(id: Long, name: String) = mockMvc.put("/api/tags/$id") {
        contentType = MediaType.APPLICATION_JSON
        content = """{"name":"$name"}"""
    }

    private fun tagFood(food: Long, vararg tags: Long) = mockMvc.put("/api/foods/$food/tags") {
        contentType = MediaType.APPLICATION_JSON
        content = """{"tagIds":[${tags.joinToString(",")}]}"""
    }.andExpect { status { isOk() } }

    private fun createFood(name: String): Long = mockMvc.post("/api/foods") {
        contentType = MediaType.APPLICATION_JSON
        content = """{"name":"$name","barcode":null,
                      "proteinPer100g":13.0,"carbsPer100g":60.0,"fatPer100g":7.0,"tagIds":[]}"""
    }.andExpect { status { isCreated() } }.andReturn().response.contentAsString.let(::idOf)

    private fun createTag(name: String): Long {
        val body = mockMvc.post("/api/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name"}"""
        }.andReturn().response.contentAsString
        return idOf(body)
    }

    private fun idOf(json: String): Long = objectMapper.readTree(json).get("id").asLong()

    @Test
    fun `Tags are listed alphabetically ignoring case, accented capitals included`() {
        createTag("Été")
        createTag("éclair")

        mockMvc.get("/api/tags").andExpect {
            jsonPath("$[*].name") { value(org.hamcrest.Matchers.contains("éclair", "Été")) }
        }
    }
}
