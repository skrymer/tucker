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
                          "proteinPer100g":13.0,"carbsPer100g":60.0,"fatPer100g":7.0}"""
        }.andReturn().response.contentAsString.let(::idOf)
        mockMvc.put("/api/foods/$oats/tags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"tagIds":[$breakfast]}"""
        }.andExpect { status { isOk() } }

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
