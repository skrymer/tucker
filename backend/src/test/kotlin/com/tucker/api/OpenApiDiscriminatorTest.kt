package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals

/**
 * Guards the agreement between what the spec says a discriminator can be and what
 * the wire actually carries.
 *
 * `kind` is a closed set — a Food is FOOD or RECIPE, an Entry is WEIGHED or
 * ESTIMATED — and the spec is the frontend's only description of it, via the
 * generated `nuxt-open-fetch` client. A discriminator described as an open
 * `string` lets a client compare against a value the backend cannot produce and
 * get a silent always-false; `kind: 'raw'` sat in seven fixtures on exactly that
 * basis until #210.
 *
 * As in [OpenApiNullabilityTest], the two halves drift independently and are
 * guarded independently: the spec can stop listing the values, and the wire can
 * start sending something that is not one of them.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OpenApiDiscriminatorTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    @Test
    fun `a discriminator is described by the values it can take, not as an open string`() {
        assertEquals(
            setOf("FOOD", "RECIPE"),
            enumOf("FoodResponse", "kind"),
            "A Food's kind is a closed set, so the generated client should read " +
                "'FOOD' | 'RECIPE' rather than a string that admits anything.",
        )
        assertEquals(
            setOf("WEIGHED", "ESTIMATED"),
            enumOf("EntryResponse", "kind"),
            "An Entry's kind is a closed set for the same reason.",
        )
    }

    @Test
    fun `the wire carries a kind as the enum constant name`() {
        val foodJson = mockMvc.post("/api/foods") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Skyr","proteinPer100g":11.0,"carbsPer100g":4.0,"fatPer100g":0.2}"""
        }.andExpect {
            status { isCreated() }
            // One constant of each enum is enough: Jackson's rendering is a
            // property of the type, not of the constant, so FOOD standing for
            // FoodKind also stands for RECIPE (which RecipeApiTest pins anyway).
            jsonPath("$.kind") { value("FOOD") }
        }.andReturn().response.contentAsString
        val foodId = objectMapper.readTree(foodJson).get("id").asLong()

        mockMvc.post("/api/entries/weighed") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-05-22","foodId":$foodId,"grams":120.0}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.kind") { value("WEIGHED") }
        }

        mockMvc.post("/api/entries/estimated") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"date":"2026-05-22","label":"Pub lunch","calories":800.0}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.kind") { value("ESTIMATED") }
        }
    }

    /**
     * The values a spec property admits. A set, not a list: the constants' order
     * carries no meaning — persistence stores the name, not the ordinal — so
     * pinning it would fail on a harmless reorder.
     */
    private fun enumOf(schema: String, property: String): Set<String> =
        mockMvc.specSchemas(objectMapper)
            .path(schema).path("properties").path(property).path("enum")
            .map { it.asText() }.toSet()
}
