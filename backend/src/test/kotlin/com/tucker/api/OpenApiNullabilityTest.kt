package com.tucker.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Guards the agreement between what the spec promises and what the wire carries.
 *
 * Tucker serializes with Jackson's default inclusion, so a field the backend has
 * no value for arrives as an explicit `null` rather than being left out. The spec
 * is the frontend's only description of the API — via the generated
 * `nuxt-open-fetch` client — so it has to say so, or every client is told a field
 * is `T | undefined` when the value it actually receives is `T | null`.
 *
 * The two halves drift independently, so they are guarded independently: the spec
 * can stop marking fields nullable, and the wire can start omitting them. Neither
 * test catches the other's failure.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OpenApiNullabilityTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    @Test
    fun `every optional field in the spec is nullable, because the API sends null rather than omitting it`() {
        val properties = specProperties()

        // Both floors guard against a vacuous pass: an empty spec, or one whose
        // schemas resolved without properties, satisfies a subset check trivially.
        assertTrue(
            properties.isNotEmpty(),
            "No schema properties in the spec — resolution failed, and the check below proves nothing.",
        )
        assertTrue(
            properties.any { it.nullable },
            "Not one property is marked nullable, so the converter cannot have run.",
        )

        assertEquals(
            emptyList(),
            properties.filter { !it.required && !it.nullable }.map { it.path }.sorted(),
            "These fields are optional but not marked nullable, so the generated client " +
                "describes them as `undefined` while the backend sends `null`. Either the " +
                "converter did not see them, or their JSON name differs from the Kotlin " +
                "property name it matches on (see ADR 0023).",
        )
    }

    @Test
    fun `a nullable reference is wrapped in allOf, the only form OpenAPI 3 dot 0 keeps beside nullable`() {
        val budgetChange = schemas().path("DailySummaryResponse").path("properties").path("budgetChange")

        assertFalse(
            budgetChange.isMissingNode,
            "DailySummaryResponse.budgetChange is the nullable reference this pins — it has been renamed or removed.",
        )
        assertTrue(
            budgetChange.path("\$ref").isMissingNode,
            "A bare \$ref discards every sibling, silently dropping the nullable beside it.",
        )
        assertTrue(budgetChange.path("nullable").asBoolean(), "The reference must still read as nullable.")
        assertEquals(
            listOf("#/components/schemas/BudgetChange"),
            budgetChange.path("allOf").map { it.path("\$ref").asText() },
            "The wrap must preserve exactly the reference it stands in for.",
        )
    }

    /**
     * Reads a day no Weekly Review covers, which is what makes the absent values
     * absent. That rests on the suite leaving no Profile and weight committed —
     * every writing test is `@Transactional` — so a future non-transactional test
     * that completes setup would mint a bootstrap review and turn `dayStatus` into
     * a value, failing here for a reason this test does not name.
     */
    @Test
    fun `a response carries every field its schema declares, even the ones it has no value for`() {
        val declared = schemas()
            .path("DailySummaryResponse").path("properties")
            .properties().map { it.key }.toSet()

        val summary = objectMapper.readTree(
            mockMvc.get("/api/summary") { param("date", "2026-06-10") }
                .andExpect { status { isOk() } }
                .andReturn().response.contentAsString,
        )

        assertEquals(
            declared,
            summary.properties().map { it.key }.toSet(),
            "The spec promises these fields and the wire has to carry them, present and null.",
        )
        assertTrue(
            summary.path("dayStatus").isNull,
            "A day before the first Weekly Review has no status — the proof that the " +
                "field is sent as null rather than omitted, which is what makes this test bite.",
        )
    }

    /** One property of one schema, reduced to the two axes that describe absence. */
    private data class SpecProperty(val path: String, val required: Boolean, val nullable: Boolean)

    private fun specProperties(): List<SpecProperty> =
        schemas().properties().flatMap { (schemaName, schema) ->
            val required = schema.path("required").map { it.asText() }.toSet()
            schema.path("properties").properties().map { (name, property) ->
                SpecProperty(
                    path = "$schemaName.$name",
                    required = name in required,
                    nullable = property.path("nullable").asBoolean(),
                )
            }
        }

    private fun schemas(): JsonNode = fetchSpec().path("components").path("schemas")

    private fun fetchSpec(): JsonNode =
        objectMapper.readTree(
            mockMvc.get("/v3/api-docs")
                .andExpect { status { isOk() } }
                .andReturn().response.contentAsString,
        )
}
