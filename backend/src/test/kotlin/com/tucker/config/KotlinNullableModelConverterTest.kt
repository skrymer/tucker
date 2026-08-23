package com.tucker.config

import com.fasterxml.jackson.databind.ObjectMapper
import io.swagger.v3.core.converter.ModelConverters
import io.swagger.v3.oas.models.media.Schema
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The converter that carries Kotlin nullability into the spec (ADR 0023), run on
 * its own swagger chain rather than through a booted application.
 *
 * `OpenApiNullabilityTest` asserts the same rule against the spec the backend
 * actually serves, which is the guarantee that matters. It cannot substitute for
 * this one: springdoc builds that spec once and caches it, so every mutation of
 * the converter is invisible to a test that reads the cache.
 */
class KotlinNullableModelConverterTest {

    private enum class Colour { RED, GREEN }

    private data class Nested(val value: String, val optionalNote: String?)

    private data class Sample(
        val required: String,
        val optionalText: String?,
        val optionalNested: Nested?,
        val optionalColour: Colour?,
        val requiredColour: Colour,
    )

    private val schemas: Map<String, Schema<*>> =
        ModelConverters().apply { addConverter(KotlinNullableModelConverter(ObjectMapper())) }
            .readAll(Sample::class.java)

    private fun property(name: String): Schema<*> =
        schemas.getValue("Sample").properties.getValue(name)

    @Test
    fun `a nullable field is described as nullable`() {
        assertEquals(true, property("optionalText").nullable)
    }

    @Test
    fun `a non-nullable field is left alone`() {
        // Only the nullable ones are touched: marking everything would describe a
        // wire that never carries null for these.
        assertNotEquals(true, property("required").nullable)
    }

    @Test
    fun `a nullable reference is wrapped in the allOf the spec reserves for it`() {
        // OpenAPI 3.0 ignores every sibling of a `$ref`, so a `nullable` set beside
        // one is silently dropped and the field reads as non-nullable again.
        val nested = property("optionalNested")

        assertNull(nested.`$ref`, "the bare \$ref would swallow the nullable beside it")
        assertEquals(true, nested.nullable)
        assertEquals(
            "#/components/schemas/Nested",
            nested.allOf.single().`$ref`,
        )
    }

    @Test
    fun `a referenced model is marked on the definition, not on the reference`() {
        // By the time a nested model is resolved the chain hands back a bare
        // `$ref`, which carries no properties — the fields live on the registered
        // definition. Marking the reference instead would silently mark nothing.
        assertEquals(
            true,
            schemas.getValue("Nested").properties.getValue("optionalNote").nullable,
        )
    }

    @Test
    fun `a nullable enum lists null among the values it admits`() {
        // `enum` is the stricter keyword — it admits exactly what it lists — so
        // `nullable` beside one would mark legal a value the same schema forbids.
        val colour = property("optionalColour")

        assertEquals(true, colour.nullable)
        assertTrue(
            colour.enum.contains(null),
            "a nullable enum must list null too, was ${colour.enum}",
        )
    }

    @Test
    fun `a non-nullable enum is not given a null value to admit`() {
        assertEquals(listOf("RED", "GREEN"), property("requiredColour").enum)
    }
}
